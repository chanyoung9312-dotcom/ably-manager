const SEOUL={latitude:37.5665,longitude:126.9780};

async function getWeather(){
  const u=new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude',SEOUL.latitude);
  u.searchParams.set('longitude',SEOUL.longitude);
  u.searchParams.set('timezone','Asia/Seoul');
  u.searchParams.set('current','temperature_2m,apparent_temperature,precipitation,weather_code');
  u.searchParams.set('daily','temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  u.searchParams.set('forecast_days','7');
  const r=await fetch(u,{cache:'no-store'});
  if(!r.ok)throw new Error(`날씨 ${r.status}`);
  return r.json();
}

function weatherSummary(w){
  const d=w.daily||{}, days=(d.time||[]).map((date,i)=>({date,max:d.temperature_2m_max?.[i],min:d.temperature_2m_min?.[i],rain:d.precipitation_probability_max?.[i]}));
  return {location:'서울 기준',current:w.current||{},forecast:days};
}

function fallback(x,w){
  const m=x.market||{}, orderDown=m.q30<m.p30, uploadUp=m.md30>m.mdPrev30;
  return {
    observation:orderDown&&uploadUp?'최근 30일 신상품 업로드는 늘었지만 주문은 감소했습니다. 단순 등록량 부족보다는 최근 등록 상품의 반응, 기존 주력상품 약화, 계절 전환 영향을 함께 확인할 필요가 있습니다.':orderDown?'최근 주문 흐름이 이전 기간보다 약합니다. 특정 상품 문제인지 마켓 전반의 반응 변화인지 상품별 신호와 함께 확인할 필요가 있습니다.':'주문과 신상품 업로드 흐름이 크게 한 방향으로 쏠리지 않았습니다. 최근 반응 상품과 계절 전환 상품의 움직임을 함께 보는 구간입니다.',
    direction:'무재고 운영의 장점을 살려 재고를 선행 확보하기보다 현재 기온에 바로 입을 수 있는 상품을 폭넓게 테스트하고, 실제 주문이 붙는 스타일의 유사 상품을 빠르게 확장하는 방향을 우선 검토하세요.',
    caution:'날씨나 계절만으로 주문 변화를 단정하지 마세요. 여름·간절기 상품이 함께 약하다면 상품 구성 외에 기존 주력상품의 수명과 마켓 전체 노출 변화도 별도로 확인해야 합니다.',
    weather:`서울 기준 현재 ${w.current?.temperature_2m??'-'}℃, 체감 ${w.current?.apparent_temperature??'-'}℃입니다.`,
    ai:false
  };
}

export async function POST(req){
  try{
    const input=await req.json();
    const weather=weatherSummary(await getWeather());
    const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
    if(!token)return Response.json(fallback(input,weather));
    const prompt=`너는 여성 패션 이커머스 쇼핑몰 OARS의 데이터 기반 MD 분석가다. 최종 판단은 사람이 한다. 사용자의 생각에 맞장구치지 말고 데이터와 반대되는 신호가 있으면 적극적으로 지적한다.\n\n운영 특성: 20대 초중반 여성 타깃, 중국 도매 상품을 무재고로 먼저 등록하고 주문 반응이 확인되면 소량 재고를 검토한다. 일반 사입몰처럼 시즌 재고를 미리 쌓을 필요는 없지만 고객 수요의 계절/날씨 타이밍과 상품 등록 타이밍은 중요하다. 주문 1건을 재고매입 신호로 단정하지 않는다.\n\n분석 원칙:\n- 주문 반응, 최근/이전 7·14·30일 흐름, 주문 발생일, MD 시트 신상품 업로드 수와 최근 상품명, 재고/취소/반품 신호, 현재 날짜, 서울 7일 날씨를 종합한다.\n- MD 상품명에서 카테고리와 계절성(반팔/긴팔/니트/가디건/원피스/스커트/레이어드 등)을 읽고 최근 날씨와 맞는지 해석한다.\n- 상관관계를 원인으로 확정하지 않는다. 근거가 약하면 명시한다.\n- 무재고이므로 '대량 사입'을 기본 제안으로 하지 않는다. 방향성은 테스트 → 반응 확인 → 유사상품 확장 중심으로 제안한다.\n- 숫자는 입력 데이터에 있는 것만 사용한다.\n\n데이터:\n${JSON.stringify({date:input.date,market:input.market,signals:input.signals,mdRecent:input.mdRecent,weather})}\n\n반드시 JSON만 반환한다. 형식: {"observation":"현재 상황을 2~4문장으로 종합 분석","direction":"지금 우선 테스트/확인할 방향을 2~4문장으로 제안","caution":"반대 신호, 불확실성, 사용자가 놓칠 수 있는 점을 1~3문장으로 지적","weather":"날씨가 상품 수요에 주는 의미를 1~2문장으로 설명"}`;
    const r=await fetch('https://ai-gateway.vercel.sh/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({model:'openai/gpt-5.6-sol',input:prompt,max_output_tokens:1200})});
    if(!r.ok){console.error('AI Gateway',r.status,await r.text());return Response.json(fallback(input,weather));}
    const j=await r.json();
    const text=j.output_text||j.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'';
    try{const parsed=JSON.parse(text.replace(/^```json\s*|\s*```$/g,''));return Response.json({...parsed,ai:true,weatherData:weather})}catch{return Response.json(fallback(input,weather))}
  }catch(e){console.error(e);return Response.json({error:e.message||'OARS 분석 실패'},{status:500})}
}
