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
  const d=w.daily||{},days=(d.time||[]).map((date,i)=>({date,max:d.temperature_2m_max?.[i],min:d.temperature_2m_min?.[i],rain:d.precipitation_probability_max?.[i]}));
  return {location:'서울 기준',current:w.current||{},forecast:days};
}

function fallback(x,w){
  const m=x.market||{},orderDown=m.q30<m.p30,uploadUp=m.md30>m.mdPrev30;
  return {
    observation:orderDown&&uploadUp?`최근 30일 주문은 ${m.p30??'-'}개에서 ${m.q30??'-'}개로 줄었고, 같은 기간 신상품 업로드는 ${m.mdPrev30??'-'}개에서 ${m.md30??'-'}개로 늘었습니다. 현재 데이터에서는 등록량과 주문 반응이 반대로 움직이고 있어 단순 업로드 부족으로 보기 어렵습니다.`:orderDown?`최근 30일 주문이 ${m.p30??'-'}개에서 ${m.q30??'-'}개로 감소했습니다. 우선 특정 상품의 하락인지 기존 주력상품을 포함한 마켓 전반의 하락인지 분리해 볼 필요가 있습니다.`:'최근 주문과 신상품 업로드 흐름에서 한 가지 원인으로 설명할 만큼 뚜렷한 신호는 아직 부족합니다.',
    direction:'다음 업로드에서는 수량 자체를 늘리기보다 최근 7~14일 실제 주문이 발생한 상품들의 공통 요소를 찾고, 그와 비슷한 카테고리·핏·무드·가격대 상품을 소규모로 추가 테스트하세요. 테스트 결과 주문이 반복되는 상품군만 빠르게 확장하는 방식이 현재 무재고 구조와 잘 맞습니다.',
    caution:'이 방향이 맞으려면 최근 신상품의 반응이 기존 상품보다 실제로 약하다는 근거가 필요합니다. 기존 주력상품까지 함께 하락했다면 신상품 선택보다 계절 전환·노출 변화·주력상품 수명 문제가 더 큰 원인일 수 있으므로 별도로 확인해야 합니다.',
    weather:`서울 기준 현재 ${w.current?.temperature_2m??'-'}℃, 체감 ${w.current?.apparent_temperature??'-'}℃입니다. 날씨는 상품 구성 판단의 보조 근거이며 주문 감소의 원인으로 단독 해석하지 않습니다.`,
    ai:false
  };
}

export async function POST(req){
  try{
    const input=await req.json();
    const weather=weatherSummary(await getWeather());
    const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
    if(!token)return Response.json(fallback(input,weather));
    const prompt=`너는 여성 패션 이커머스 쇼핑몰 OARS의 데이터 기반 MD 분석가다. 최종 판단은 사람이 한다. 사용자의 생각에 맞장구치지 말고 데이터와 반대되는 신호가 있으면 적극적으로 지적한다.

운영 특성: 20대 초중반 여성 타깃, 중국 도매 상품을 무재고로 먼저 등록하고 주문 반응이 확인되면 소량 재고를 검토한다. 일반 사입몰처럼 시즌 재고를 미리 쌓을 필요는 없지만 고객 수요의 계절/날씨 타이밍과 상품 등록 타이밍은 중요하다. 주문 1건을 재고매입 신호로 단정하지 않는다.

가장 중요한 출력 원칙: observation, direction, caution은 서로 같은 말을 바꿔 쓰면 안 된다. 세 필드는 각각 완전히 다른 직무를 맡는다.

1) observation = 사실/진단 전용
- '무슨 일이 벌어졌는가'만 설명한다.
- 반드시 입력에 있는 구체적인 비교 숫자를 우선 사용한다.
- 주문, 업로드, 상품별 반응, 취소/반품 중 의미 있는 변화 사이의 관계를 설명한다.
- 행동 제안이나 '하세요/검토하세요' 같은 문장을 넣지 않는다.

2) direction = 행동/실험 전용
- observation을 반복하거나 숫자를 다시 요약하지 않는다.
- '그래서 지금 무엇을 테스트할 것인가'를 말한다.
- 추상적인 '폭넓게 테스트', '확인 필요'만 쓰지 말고 데이터가 허용하는 범위에서 1~3개의 구체적인 다음 행동을 제시한다.
- 가능하면 최근 반응 상품/MD 상품명의 카테고리, 핏, 무드, 계절성, 가격대 등의 공통점을 이용해 어떤 계열을 더 테스트하거나 줄일지 제안한다.
- 무재고 구조이므로 대량 사입보다 등록 테스트 → 주문 반복 확인 → 유사상품 확장을 우선한다.

3) caution = 반증/실패조건 전용
- observation과 direction을 다시 설명하지 않는다.
- direction이 틀릴 수 있는 데이터, 대안 가설, 아직 확인되지 않은 전제를 지적한다.
- 가능하면 '어떤 데이터가 나오면 현재 방향을 수정해야 하는지'까지 말한다.
- 날씨/계절을 만능 원인으로 사용하지 않는다.

4) weather = 날씨/시즌 전용
- 서울 현재 기온과 7일 예보를 상품 계절성 관점에서 해석한다.
- 단순 기온 낭독이 아니라 지금 입기 쉬운 두께/카테고리와 너무 이르거나 늦을 수 있는 상품을 짧게 설명한다.
- 날씨는 보조 판단요소이며 주문 변화의 원인으로 확정하지 않는다.

공통 분석 원칙:
- 주문 반응, 최근/이전 7·14·30일 흐름, 주문 발생일, MD 시트 신상품 업로드 수와 최근 상품명, 재고/취소/반품 신호, 현재 날짜, 서울 7일 날씨를 종합한다.
- MD 상품명에서 카테고리와 계절성(반팔/긴팔/니트/가디건/원피스/스커트/레이어드 등)을 읽는다.
- 상관관계를 원인으로 확정하지 않는다. 근거가 약하면 명시한다.
- 숫자는 입력 데이터에 있는 것만 사용한다. 데이터에 없는 조회수, 노출량, 전환율 등을 사실처럼 만들지 않는다.
- 세 필드에 같은 핵심 문장을 반복하지 않는다. 각 필드가 새 정보를 추가해야 한다.

데이터:
${JSON.stringify({date:input.date,market:input.market,signals:input.signals,mdRecent:input.mdRecent,weather})}

반드시 JSON만 반환한다. 형식: {"observation":"구체적 숫자 중심의 사실/진단 2~4문장","direction":"중복 없는 구체적 행동/실험 2~4문장","caution":"현재 방향을 반박할 수 있는 신호와 실패조건 1~3문장","weather":"날씨와 상품 계절성의 실용적 해석 1~2문장"}`;
    const r=await fetch('https://ai-gateway.vercel.sh/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({model:'openai/gpt-5.6-sol',input:prompt,max_output_tokens:1400})});
    if(!r.ok){console.error('AI Gateway',r.status,await r.text());return Response.json(fallback(input,weather));}
    const j=await r.json();
    const text=j.output_text||j.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'';
    try{const parsed=JSON.parse(text.replace(/^```json\s*|\s*```$/g,''));return Response.json({...parsed,ai:true,weatherData:weather})}catch{return Response.json(fallback(input,weather))}
  }catch(e){console.error(e);return Response.json({error:e.message||'OARS 분석 실패'},{status:500})}
}
