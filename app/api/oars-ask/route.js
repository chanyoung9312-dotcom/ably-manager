const SEOUL={latitude:37.5665,longitude:126.9780};
async function weather(){try{const u=new URL('https://api.open-meteo.com/v1/forecast');u.searchParams.set('latitude',SEOUL.latitude);u.searchParams.set('longitude',SEOUL.longitude);u.searchParams.set('timezone','Asia/Seoul');u.searchParams.set('current','temperature_2m,apparent_temperature');u.searchParams.set('daily','temperature_2m_max,temperature_2m_min,precipitation_probability_max');u.searchParams.set('forecast_days','7');const r=await fetch(u,{cache:'no-store'});return r.ok?await r.json():null}catch{return null}}
export async function POST(req){try{const {question,context}=await req.json();if(!question?.trim())return Response.json({error:'질문을 입력해주세요.'},{status:400});const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;if(!token)return Response.json({answer:'AI 연결 설정을 확인해주세요.',ai:false});const w=await weather();const prompt=`너는 OARS Manager 안의 여성 패션 이커머스 전용 AI MD다. 두 명이 운영하는 소규모 에이블리 여성의류 쇼핑몰의 제3의 MD처럼 행동한다. 사용자의 결정을 대신하지 않고, 데이터에서 확인되는 사실·해석·반대 근거·실행 가능한 다음 확인사항을 제공한다.

운영 방식:
- 20대 초중반 여성 타깃.
- 중국 도매 상품을 무재고로 먼저 등록하고 주문 반응이 확인되면 소량 재고를 검토한다.
- 주문 1건만으로 재고 확보를 권하지 않는다.
- 에이블리 주문 시트는 취소된 주문도 주문 반응 데이터로 남는다.
- 발주 후 취소는 재고 위험, 배송 후 반품은 상품/핏/품질 위험 신호로 별도 해석한다.
- MD 시트는 무엇을 언제 어떤 가격/마진/색상/사이즈로 소싱·등록했는지 보여주는 데이터다.

답변 규칙:
- 질문에 직접 답한다. 장황한 일반론보다 현재 데이터에 연결한다.
- 숫자는 제공된 데이터만 사용한다. 조회수·노출·전환율처럼 없는 데이터는 만들지 않는다.
- 사실과 추정 원인을 구분한다. 원인은 '가능성'으로 표현한다.
- 사용자의 가설과 반대되는 데이터가 있으면 반드시 말한다.
- 데이터가 부족하면 무엇을 추가 확인해야 하는지 정확히 말한다.
- 상품명에서 카테고리/핏/무드/계절성을 읽을 수 있지만 과도하게 단정하지 않는다.
- 소싱 질문에는 최근 반응 상품과 최근 MD 등록 구성을 비교해 구체적인 상품 계열을 제안한다.
- 재고 질문에는 주문 반복성, 최근 속도, 현재 재고, 발주 후 취소를 함께 본다.
- 답변 마지막에 필요할 때만 '반대 신호'를 한 문장 덧붙인다.
- 한국어로 자연스럽고 간결하게 답한다.

현재 서울 날씨 데이터:
${JSON.stringify(w)}

현재 OARS 데이터:
${JSON.stringify(context)}

사용자 질문: ${question}

질문에 대한 답변만 작성한다.`;const r=await fetch('https://ai-gateway.vercel.sh/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({model:'openai/gpt-5.6-sol',input:prompt,max_output_tokens:1800})});if(!r.ok){console.error('AI Gateway',r.status,await r.text());return Response.json({error:'OARS AI 응답에 실패했습니다.'},{status:502})}const j=await r.json(),answer=j.output_text||j.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'';return Response.json({answer,ai:true})}catch(e){console.error(e);return Response.json({error:e.message||'OARS 질문 처리 실패'},{status:500})}}
