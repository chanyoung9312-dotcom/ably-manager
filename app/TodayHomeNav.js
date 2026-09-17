"use client";
import { usePathname, useRouter } from "next/navigation";

const main = [
  ["오늘", "/"],
  ["주문·배송", "/?tool=sms"],
  ["매출", "/dashboard"],
  ["MD", "/product-reaction"],
  ["재고", "/products"],
];
const more = [
  ["상품번호 매칭", "/product-match"],
  ["우체국 엑셀", "/?tool=post"],
  ["송장 매칭", "/?tool=tracking"],
];

export default function TodayHomeNav() {
  const pathname = usePathname();
  const router = useRouter();
  const go = (href) => router.push(href);
  return (
    <nav className="oars-nav" aria-label="OARS 주요 메뉴">
      <div className="oars-nav-inner">
        <b className="oars-brand" onClick={() => go("/")}>OARS</b>
        <div className="oars-main-tabs">
          {main.map(([label, href]) => (
            <button key={label} className={pathname === href.split("?")[0] && href !== "/?tool=sms" ? "active" : ""} onClick={() => go(href)}>{label}</button>
          ))}
        </div>
        <details className="oars-more">
          <summary>더보기</summary>
          <div>
            {more.map(([label, href]) => <button key={label} onClick={() => go(href)}>{label}</button>)}
          </div>
        </details>
      </div>
      <style jsx>{`
        .oars-nav{position:sticky;top:0;z-index:50;background:#15191b;border-bottom:1px solid #303638;color:#f7f7f7}.oars-nav-inner{max-width:1180px;margin:auto;min-height:58px;padding:0 18px;display:flex;align-items:center;gap:22px}.oars-brand{font-size:18px;cursor:pointer}.oars-main-tabs{display:flex;gap:5px;flex:1}.oars-main-tabs button,.oars-more summary,.oars-more button{border:0;background:transparent;color:inherit;padding:10px 12px;border-radius:10px;font:inherit;font-weight:700;cursor:pointer}.oars-main-tabs button:hover,.oars-main-tabs button.active,.oars-more summary:hover{background:#252b2e}.oars-more{position:relative}.oars-more summary{list-style:none}.oars-more div{position:absolute;right:0;top:44px;min-width:170px;background:#202527;border:1px solid #353c3f;border-radius:12px;padding:7px;box-shadow:0 12px 30px #0006}.oars-more button{display:block;width:100%;text-align:left}.oars-more button:hover{background:#303638}@media(max-width:720px){.oars-nav-inner{padding:0 10px;gap:8px}.oars-brand{display:none}.oars-main-tabs{overflow-x:auto}.oars-main-tabs button{white-space:nowrap;padding:9px 10px;font-size:13px}.oars-more summary{font-size:13px;padding:9px 8px}}
      `}</style>
    </nav>
  );
}
