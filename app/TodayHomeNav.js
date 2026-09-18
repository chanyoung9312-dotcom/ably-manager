"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const menu = [
  ["주문·배송", "/?tool=sms"],
  ["매출", "/dashboard"],
  ["사입 판단", "/analysis"],
  ["재고 현황", "/products"],
  ["상품번호 매칭", "/product-match"],
  ["우체국 엑셀", "/?tool=post"],
  ["송장 매칭", "/?tool=tracking"],
];

export default function TodayHomeNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [tool, setTool] = useState("");

  useEffect(() => {
    setTool(new URLSearchParams(window.location.search).get("tool") || "");
    document.body.classList.toggle("oars-root-page", pathname === "/");
    return () => document.body.classList.remove("oars-root-page");
  }, [pathname]);

  const go = (href) => {
    if (href === "/" || href.includes("?")) {
      window.location.assign(href);
      return;
    }
    router.push(href);
  };
  const active = (href) => {
    const [path, query = ""] = href.split("?");
    if (pathname !== path) return false;
    const targetTool = new URLSearchParams(query).get("tool") || "";
    return targetTool ? tool === targetTool : !tool;
  };

  return (
    <nav className="oars-nav" aria-label="OARS 주요 메뉴">
      <div className="oars-nav-inner">
        <button className="oars-home" onClick={() => go("/")} aria-label="홈으로 돌아가기">← 홈</button>
        <b className="oars-brand" onClick={() => go("/")}>OARS</b>
        <div className="oars-main-tabs">
          {menu.map(([label, href]) => (
            <button key={label} className={active(href) ? "active" : ""} onClick={() => go(href)}>{label}</button>
          ))}
        </div>
      </div>
      <style jsx>{`
        .oars-nav{position:sticky;top:0;z-index:50;background:#15191b;border-bottom:1px solid #303638;color:#f7f7f7}.oars-nav-inner{max-width:1180px;margin:auto;min-height:58px;padding:0 18px;display:flex;align-items:center;gap:10px}.oars-home{border:1px solid #3b4447;background:#202628;color:inherit;padding:8px 11px;border-radius:10px;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap}.oars-home:hover{background:#30383b}.oars-brand{font-size:18px;cursor:pointer;margin-right:6px;white-space:nowrap}.oars-main-tabs{display:flex;align-items:center;gap:7px;flex:1;overflow-x:auto;scrollbar-width:none}.oars-main-tabs::-webkit-scrollbar{display:none}.oars-main-tabs button{border:1px solid #343c40;background:#1a1f21;color:inherit;padding:9px 12px;border-radius:11px;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap}.oars-main-tabs button:hover{background:#252b2e;border-color:#566166}.oars-main-tabs button.active{background:#2a3235;border-color:#8b9aa0;box-shadow:inset 0 -2px 0 #f3f4f6}@media(max-width:720px){.oars-nav-inner{padding:0 10px;gap:7px}.oars-home{padding:8px 10px;font-size:13px}.oars-brand{display:none}.oars-main-tabs{scroll-snap-type:x proximity}.oars-main-tabs button{padding:9px 12px;font-size:13px;scroll-snap-align:start}}
      `}</style>
      <style jsx global>{`
        body.oars-root-page .wrap > h1:first-child + .sub + .actions { display:none !important; }
      `}</style>
    </nav>
  );
}
