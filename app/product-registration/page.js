"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildStoredZip,
  guessFolderRole,
  mimeFromName,
  readZipImages,
  roleLabel,
} from "../../lib/local-zip.mjs";
import Cafe24RegistrationPanel from "./Cafe24RegistrationPanel";

const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
const IMAGE_FILE = /\.(?:jpe?g|png|webp|gif)$/i;
const STATES = {
  keep: { label: "사용", tone: "ok" },
  crop: { label: "상단 자르기", tone: "crop" },
  exclude: { label: "제외", tone: "bad" },
};
const ROLE_OPTIONS = [
  ["main", "메인·GIF용"],
  ["detail", "상세이미지"],
  ["size", "사이즈 참고"],
  ["ignore", "무시"],
];

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName(name) {
  return String(name || "").replace(/\.zip$/i, "");
}

function outputFormat(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return { mime: "image/png", ext: ".png" };
  if (lower.endsWith(".webp")) return { mime: "image/webp", ext: ".webp" };
  return { mime: "image/jpeg", ext: ".jpg" };
}

function stem(name) {
  return String(name || "").replace(/\.[^.]+$/, "");
}

async function cropImage(item) {
  const image = await loadImage(item.url);
  const sourceY = Math.round(image.naturalHeight * (item.cropTop / 100));
  const height = image.naturalHeight - sourceY;
  if (height <= 0) throw new Error("잘라낼 범위를 확인해주세요.");

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("브라우저 이미지 편집을 사용할 수 없습니다.");
  ctx.drawImage(
    image,
    0,
    sourceY,
    image.naturalWidth,
    height,
    0,
    0,
    image.naturalWidth,
    height,
  );

  const format = outputFormat(item.fileName);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, format.mime, format.mime === "image/jpeg" ? 0.94 : undefined),
  );
  if (!blob) throw new Error("이미지 저장에 실패했습니다.");
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    fileName: `${stem(item.fileName)}_상단${item.cropTop}퍼센트제거${format.ext}`,
    blob,
  };
}

function sorted(list) {
  return [...list].sort((a, b) => collator.compare(a.name, b.name));
}

export default function ProductRegistrationHelperPage() {
  const [zipName, setZipName] = useState("");
  const [items, setItems] = useState([]);
  const [folderRoles, setFolderRoles] = useState({});
  const [stage, setStage] = useState("folders");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const folderInputRef = useRef(null);
  const itemsRef = useRef([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.url);
    };
  }, []);

  const folders = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.folder)) map.set(item.folder, []);
      map.get(item.folder).push(item);
    }
    return [...map.entries()]
      .map(([name, files]) => ({ name, files: sorted(files) }))
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [items]);

  const activeItems = useMemo(
    () =>
      items
        .map((item) => ({ ...item, role: folderRoles[item.folder] || "" }))
        .filter((item) => item.role === "main" || item.role === "detail"),
    [items, folderRoles],
  );

  const counts = useMemo(
    () =>
      activeItems.reduce(
        (acc, item) => {
          acc[item.role] += item.state === "exclude" ? 0 : 1;
          acc[item.state] += 1;
          return acc;
        },
        { main: 0, detail: 0, keep: 0, crop: 0, exclude: 0 },
      ),
    [activeItems],
  );

  function releaseItems() {
    for (const item of itemsRef.current) URL.revokeObjectURL(item.url);
    itemsRef.current = [];
  }

  function installEntries(data, sourceName) {
    if (!data.length) throw new Error("이미지 파일을 찾지 못했습니다.");

    releaseItems();
    const next = data
      .map((entry, index) => ({
        ...entry,
        id: `${entry.name}-${index}`,
        url: URL.createObjectURL(new Blob([entry.data], { type: mimeFromName(entry.fileName) })),
        state: "keep",
        cropTop: 20,
      }))
      .sort((a, b) => collator.compare(a.name, b.name));

    const roles = {};
    for (const entry of next) {
      if (!(entry.folder in roles)) roles[entry.folder] = guessFolderRole(entry.folder);
    }

    itemsRef.current = next;
    setItems(next);
    setFolderRoles(roles);
    setZipName(sourceName);
    setStage("folders");
    setNotice(
      `${next.length}장의 이미지를 찾았습니다. 추천 분류를 확인하고 각 폴더의 역할을 확정해주세요.`,
    );
  }

  async function loadZip(file) {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) {
      setNotice("VVIC에서 내려받은 ZIP 파일을 선택해주세요.");
      return;
    }
    setBusy(true);
    setNotice("ZIP 안의 이미지 폴더를 읽는 중...");
    try {
      installEntries(await readZipImages(await file.arrayBuffer()), file.name);
    } catch (error) {
      setNotice(error.message || "ZIP 파일을 읽지 못했습니다.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function loadFolder(fileList) {
    const files = [...(fileList || [])].filter((file) => IMAGE_FILE.test(file.name));
    if (!files.length) {
      setNotice("선택한 폴더에서 이미지 파일을 찾지 못했습니다.");
      return;
    }
    setBusy(true);
    setNotice("폴더 안의 이미지 구조를 읽는 중...");
    try {
      const firstPath = files[0].webkitRelativePath || files[0].name;
      const sourceRoot = firstPath.split("/").filter(Boolean)[0] || "VVIC_폴더";
      const data = [];
      for (const file of files) {
        const relative = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
        const parts = relative.split("/").filter(Boolean);
        const nestedFolders = parts.slice(1, -1);
        const recognized = nestedFolders.find((name) => guessFolderRole(name));
        const folder = recognized || nestedFolders[0] || parts[0] || "(루트 파일)";
        data.push({
          name: parts.length > 1 ? parts.slice(1).join("/") : file.name,
          folder,
          fileName: file.name,
          data: new Uint8Array(await file.arrayBuffer()),
        });
      }
      installEntries(data, sourceRoot);
    } catch (error) {
      setNotice(error.message || "폴더를 읽지 못했습니다.");
    } finally {
      setBusy(false);
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  function setFolderRole(folder, role) {
    setFolderRoles((current) => ({ ...current, [folder]: role }));
  }

  function startEditing() {
    const unresolved = folders.filter((folder) => !folderRoles[folder.name]);
    if (unresolved.length) {
      setNotice(`분류를 정하지 않은 폴더가 있습니다: ${unresolved.map((x) => x.name).join(", ")}`);
      return;
    }
    const mainCount = folders
      .filter((folder) => folderRoles[folder.name] === "main")
      .reduce((sum, folder) => sum + folder.files.length, 0);
    const detailCount = folders
      .filter((folder) => folderRoles[folder.name] === "detail")
      .reduce((sum, folder) => sum + folder.files.length, 0);
    if (!mainCount || !detailCount) {
      setNotice("메인·GIF용 폴더와 상세이미지 폴더를 각각 하나 이상 지정해주세요.");
      return;
    }
    setStage("edit");
    setNotice(
      `분류 확정: 메인·GIF용 ${mainCount}장 / 상세이미지 ${detailCount}장. 이제 사용할 이미지만 정리하면 됩니다.`,
    );
  }

  function patch(id, values) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...values } : item)),
    );
  }

  async function saveCrop(item) {
    try {
      const result = await cropImage(item);
      downloadBlob(result.blob, result.fileName);
      setNotice(`${item.fileName} 크롭본을 저장했습니다.`);
    } catch (error) {
      setNotice(error.message || "이미지를 처리하지 못했습니다.");
    }
  }

  async function buildOutputFiles() {
    const main = sorted(
      items.filter(
        (item) => folderRoles[item.folder] === "main" && item.state !== "exclude",
      ),
    );
    const detail = sorted(
      items.filter(
        (item) => folderRoles[item.folder] === "detail" && item.state !== "exclude",
      ),
    );
    if (!main.length || !detail.length) {
      throw new Error("메인·GIF용과 상세이미지에 각각 사용할 이미지가 한 장 이상 필요합니다.");
    }

    const files = [];
    for (const [list, folderName] of [
      [main, "01_메인_GIF용"],
      [detail, "02_상세이미지"],
    ]) {
      for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        const processed =
          item.state === "crop"
            ? await cropImage(item)
            : { data: item.data, fileName: item.fileName };
        const order = String(index + 1).padStart(2, "0");
        files.push({
          path: `${folderName}/${order}_${processed.fileName}`,
          data: processed.data,
        });
      }
    }
    return { files, mainCount: main.length, detailCount: detail.length };
  }

  async function exportFolder() {
    if (!window.showDirectoryPicker) {
      setNotice("이 브라우저는 폴더 저장을 지원하지 않습니다. Chrome에서 사용하거나 ZIP 저장을 이용해주세요.");
      return;
    }
    try {
      const root = await window.showDirectoryPicker({ mode: "readwrite" });
      setBusy(true);
      setNotice("정리한 이미지를 선택한 폴더에 저장하는 중...");
      const output = await buildOutputFiles();
      for (const file of output.files) {
        const [folderName, fileName] = file.path.split("/");
        const folder = await root.getDirectoryHandle(folderName, { create: true });
        const handle = await folder.getFileHandle(fileName, { create: true });
        const writable = await handle.createWritable();
        await writable.write(file.data);
        await writable.close();
      }
      setNotice(
        `폴더 저장 완료: 01_메인_GIF용 ${output.mainCount}장 / 02_상세이미지 ${output.detailCount}장`,
      );
    } catch (error) {
      if (error?.name !== "AbortError") {
        setNotice(error.message || "정리 폴더를 저장하지 못했습니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function exportZip() {
    setBusy(true);
    setNotice("정리한 이미지를 ZIP으로 묶는 중...");
    try {
      const output = await buildOutputFiles();
      const zip = buildStoredZip(output.files);
      downloadBlob(
        new Blob([zip], { type: "application/zip" }),
        `${baseName(zipName) || "VVIC"}_정리완료.zip`,
      );
      setNotice(
        `정리 완료 ZIP을 만들었습니다. 메인·GIF용 ${output.mainCount}장 / 상세이미지 ${output.detailCount}장만 들어갑니다.`,
      );
    } catch (error) {
      setNotice(error.message || "정리 ZIP을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    releaseItems();
    setItems([]);
    setFolderRoles({});
    setZipName("");
    setStage("folders");
    setNotice("새 상품 폴더를 열거나 VVIC ZIP을 선택해주세요.");
  }

  function ImageCard({ item }) {
    const state = STATES[item.state];
    return (
      <article className={`image-card ${state.tone}`}>
        <div className="image-wrap">
          <img src={item.url} alt={item.fileName} />
          {item.state === "crop" && (
            <div
              className="crop-mask"
              style={{ height: `${item.cropTop}%` }}
              aria-hidden="true"
            >
              잘라낼 영역
            </div>
          )}
          {item.state === "exclude" && <div className="exclude-mask">제외</div>}
        </div>
        <div className="card-body">
          <b className="file-name" title={item.fileName}>{item.fileName}</b>
          <div className="state-buttons" aria-label={`${item.fileName} 처리 선택`}>
            {Object.entries(STATES).map(([key, value]) => (
              <button
                key={key}
                className={item.state === key ? "selected" : ""}
                onClick={() => patch(item.id, { state: key })}
              >
                {value.label}
              </button>
            ))}
          </div>
          {item.state === "crop" && (
            <div className="crop-control">
              <div>
                <b>위에서 {item.cropTop}% 제거</b>
                <span>모델 얼굴이 포함된 상단 전체를 잘라냅니다.</span>
              </div>
              <input
                aria-label={`${item.fileName} 상단 크롭 비율`}
                type="range"
                min="5"
                max="45"
                step="1"
                value={item.cropTop}
                onChange={(event) => patch(item.id, { cropTop: Number(event.target.value) })}
              />
              <div className="presets">
                {[10, 15, 20, 25, 30].map((value) => (
                  <button key={value} onClick={() => patch(item.id, { cropTop: value })}>
                    {value}%
                  </button>
                ))}
              </div>
              <button className="save" onClick={() => saveCrop(item)}>
                이 이미지만 크롭 저장
              </button>
            </div>
          )}
        </div>
      </article>
    );
  }

  const mainItems = activeItems.filter((item) => item.role === "main");
  const detailItems = activeItems.filter((item) => item.role === "detail");
  const sizeItems = items.filter((item) => folderRoles[item.folder] === "size");


  return (
    <main className="registration-helper">
      <header>
        <div>
          <span className="eyebrow">상품 등록 · 이미지 정리</span>
          <h1>VVIC 상품 이미지 정리 도우미</h1>
          <p>
            PC에서 압축을 풀어둔 상품 폴더를 통째로 열거나, VVIC ZIP을 그대로 열 수 있습니다.
            사람이 이미지를 확인한 뒤 메인·GIF용과 상세이미지 두 폴더로 바로 저장합니다.
          </p>
        </div>
        <div className="privacy">추가 비용 0원 · 외부 업로드 없음</div>
      </header>

      <section className="flow">
        <div className={!items.length || stage === "folders" ? "active" : ""}>
          <b>1</b><span>ZIP / 폴더 확인</span>
        </div>
        <div className={stage === "edit" ? "active" : ""}>
          <b>2</b><span>이미지 정리</span>
        </div>
        <div><b>3</b><span>ChatGPT 분석</span><small>정리 후</small></div>
        <div><b>4</b><span>카페24 등록</span><small>마지막</small></div>
      </section>

      <section className="uploader">
        <input
          ref={folderInputRef}
          id="vvic-folder"
          type="file"
          webkitdirectory=""
          directory=""
          multiple
          onChange={(event) => loadFolder(event.target.files)}
        />
        <label className="primary-input" htmlFor="vvic-folder">
          <strong>{busy ? "처리 중..." : items.length ? "다른 상품 폴더 열기" : "압축 푼 상품 폴더 열기"}</strong>
          <span>PC 작업 기본 방식 · 하위 폴더 구조를 그대로 읽습니다.</span>
        </label>
        <input
          ref={inputRef}
          id="vvic-zip"
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => loadZip(event.target.files?.[0])}
        />
        <label htmlFor="vvic-zip">
          <strong>ZIP 그대로 열기</strong>
          <span>아직 압축을 풀지 않은 경우에만 사용합니다.</span>
        </label>
        {items.length > 0 && <button className="secondary" onClick={resetAll}>초기화</button>}
      </section>

      {notice && <p className="notice" role="status">{notice}</p>}

      {items.length > 0 && stage === "folders" && (
        <>
          <section className="section-head">
            <div>
              <span className="eyebrow">1. 사람이 한 번 확인</span>
              <h2>원본 폴더 역할 정하기</h2>
              <p>
                폴더명은 공급처마다 다를 수 있어 자동 확정하지 않습니다.
                OARS가 추천값을 채워두고, 아래 선택을 확인한 뒤 작업을 시작합니다.
              </p>
            </div>
            <b>{zipName}</b>
          </section>

          <section className="folder-list">
            {folders.map((folder) => {
              const recommendation = guessFolderRole(folder.name);
              return (
                <article className="folder-card" key={folder.name}>
                  <div className="folder-top">
                    <div>
                      <b>{folder.name}</b>
                      <span>{folder.files.length}장</span>
                    </div>
                    <span className="recommend">
                      추천: {recommendation ? roleLabel(recommendation) : "직접 확인"}
                    </span>
                  </div>
                  <div className="samples">
                    {folder.files.slice(0, 4).map((item) => (
                      <img key={item.id} src={item.url} alt="" />
                    ))}
                  </div>
                  <label className="role-select">
                    <span>이 폴더는</span>
                    <select
                      aria-label={`${folder.name} 분류`}
                      value={folderRoles[folder.name] || ""}
                      onChange={(event) => setFolderRole(folder.name, event.target.value)}
                    >
                      <option value="">직접 선택</option>
                      {ROLE_OPTIONS.map(([value, label]) => (
                        <option value={value} key={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                </article>
              );
            })}
          </section>

          <section className="confirm-bar">
            <div>
              <b>최종 결과에는 2개 폴더만 생성됩니다.</b>
              <span>01_메인_GIF용 / 02_상세이미지 · 사이즈 참고와 무시는 결과 ZIP에서 제외</span>
            </div>
            <button onClick={startEditing}>이 분류로 이미지 정리 시작</button>
          </section>
        </>
      )}

      {items.length > 0 && stage === "edit" && (
        <>
          <section className="summary" aria-label="이미지 정리 현황">
            <div><span>메인·GIF용</span><b>{counts.main}</b></div>
            <div><span>상세이미지</span><b>{counts.detail}</b></div>
            <div><span>상단 크롭</span><b>{counts.crop}</b></div>
            <div><span>제외</span><b>{counts.exclude}</b></div>
          </section>

          <div className="edit-actions">
            <button className="secondary" onClick={() => setStage("folders")}>← 폴더 분류 다시 보기</button>
            <div className="action-pair">
              <button className="export" onClick={exportFolder} disabled={busy}>
                {busy ? "저장 중..." : "정리 폴더 저장"}
              </button>
              <button className="secondary" onClick={exportZip} disabled={busy}>ZIP 저장</button>
            </div>
          </div>

          <section className="image-section">
            <div className="section-head compact">
              <div>
                <span className="eyebrow">메인·GIF용</span>
                <h2>메인 썸네일 / GIF 이미지</h2>
                <p>파일명 숫자 순으로 보여줍니다. 필요 없는 이미지만 제외하면 됩니다.</p>
              </div>
              <b>{mainItems.length}장</b>
            </div>
            <div className="image-grid">
              {mainItems.map((item) => <ImageCard item={item} key={item.id} />)}
            </div>
          </section>

          <section className="image-section">
            <div className="section-head compact">
              <div>
                <span className="eyebrow">상세이미지</span>
                <h2>상세페이지에 넣을 이미지</h2>
                <p>중국어가 너무 많은 이미지는 제외하고, 얼굴이 보이면 상단 자르기를 사용합니다.</p>
              </div>
              <b>{detailItems.length}장</b>
            </div>
            <div className="image-grid">
              {detailItems.map((item) => <ImageCard item={item} key={item.id} />)}
            </div>
          </section>

          {sizeItems.length > 0 && (
            <details className="size-reference">
              <summary>사이즈 참고 이미지 {sizeItems.length}장 보기</summary>
              <p>등록 작업 중 참고만 하고 최종 정리 ZIP에는 넣지 않습니다.</p>
              <div className="reference-grid">
                {sizeItems.map((item) => <img src={item.url} alt={item.fileName} key={item.id} />)}
              </div>
            </details>
          )}

          <section className="confirm-bar bottom">
            <div>
              <b>완료하면 딱 두 폴더만 저장</b>
              <span>제외 이미지는 빠지고, 크롭 이미지는 수정본으로 교체됩니다.</span>
            </div>
            <div className="action-pair">
              <button className="export" onClick={exportFolder} disabled={busy}>
                {busy ? "저장 중..." : "정리 폴더 저장"}
              </button>
              <button className="secondary" onClick={exportZip} disabled={busy}>ZIP 저장</button>
            </div>
          </section>

          <section className="next-stage">
            <b>3. ChatGPT에서 상품정보 정리</b>
            <span>
              정리한 메인·상세 이미지를 지금 사용하는 ChatGPT에 올립니다.
              상품명 3개, 상세페이지 문구, 해시태그, 색상·사이즈와 함께
              마지막에 OARS 등록용 블록을 받아 아래에 한 번만 붙여넣으면 됩니다.
            </span>
          </section>

          <Cafe24RegistrationPanel
            buildOutputFiles={buildOutputFiles}
            sourceName={zipName}
          />
        </>
      )}

      {!items.length && (
        <section className="empty">
          <b>PC에서는 폴더 작업을 기본으로 사용합니다.</b>
          <p>이미 압축을 풀어 확인 중인 상품 폴더를 그대로 선택하면 됩니다. ZIP 열기도 보조로 남겨둡니다.</p>
        </section>
      )}

      <section className="guide">
        <h2>현재 원칙</h2>
        <p><b>폴더명으로 자동 확정하지 않음:</b> 공급처마다 이름이 달라 사람이 한 번 확인합니다.</p>
        <p><b>색상·옵션 이미지는 보통 무시:</b> 중국어 제거와 비율 보정에 시간을 쓰지 않습니다.</p>
        <p><b>사이즈 이미지는 참고자료:</b> 작업 중 확인할 수 있지만 최종 이미지 ZIP에는 넣지 않습니다.</p>
        <p><b>PC 폴더 우선:</b> 압축 푼 폴더를 바로 읽고, 정리 결과도 01_메인_GIF용 / 02_상세이미지 폴더로 로컬 저장합니다.</p>
        <p><b>유료 AI API 없음:</b> 이미지 정리와 ChatGPT 분석은 지금 사용하는 방식 그대로 진행합니다. 별도 유료 AI 서비스를 붙이지 않습니다.</p>
        <p><b>카페24는 한 번 붙여넣기:</b> ChatGPT 답변의 OARS 등록용 블록을 한 번 붙여넣으면 상품명·가격·옵션·태그·상세문구를 검수할 수 있습니다.</p>
        <p><b>안전한 임시등록:</b> 정리한 메인·상세 이미지를 자동 업로드하고, 카페24에는 항상 진열안함·판매안함 상태로 생성한 뒤 상품번호를 다시 확인합니다.</p>
      </section>

      <style jsx>{`
        .registration-helper{max-width:1180px;margin:auto;padding:28px 18px 80px;color:#f4f7f8}
        header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:22px}
        h1{font-size:32px;margin:6px 0 9px}h2{margin:5px 0 7px}.eyebrow{font-size:13px;color:#aeb7bb;font-weight:800}
        header p,.section-head p{max-width:780px;color:#b9c1c4;line-height:1.65;margin:0}.privacy{padding:10px 12px;border:1px solid #3d494d;border-radius:12px;background:#182022;white-space:nowrap;font-size:13px;font-weight:800}
        .flow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:22px 0}.flow>div{display:flex;align-items:center;gap:9px;padding:12px;border:1px solid #343e42;border-radius:13px;background:#171c1e;color:#aab3b7}.flow b{display:grid;place-items:center;width:27px;height:27px;border-radius:999px;background:#293033}.flow small{margin-left:auto;color:#747f83}.flow .active{border-color:#77878e;background:#20282b;color:#fff}.flow .active b{background:#f3f6f7;color:#161b1d}
        .uploader{display:flex;align-items:center;gap:10px;padding:15px;border:1px solid #3a4448;background:#181e20;border-radius:15px}.uploader input{position:absolute;opacity:0;pointer-events:none}.uploader label{flex:1;display:flex;flex-direction:column;gap:4px;padding:17px;border:1px dashed #69777d;border-radius:12px;cursor:pointer;background:#121719}.uploader label.primary-input{border-style:solid;border-color:#8d9ca2;background:#20282b}.uploader label span{font-size:13px;color:#9da8ac}.secondary{background:#242c2f}.notice{padding:11px 13px;background:#20282b;border-radius:10px;color:#dce3e5}
        .section-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin:28px 0 14px}.section-head>b{color:#b5bec1;max-width:360px;text-align:right;overflow-wrap:anywhere}.section-head.compact{align-items:center;margin-top:34px}
        .folder-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.folder-card{border:1px solid #364044;border-radius:15px;background:#171c1e;padding:14px}.folder-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.folder-top>div{display:flex;gap:8px;align-items:center}.folder-top>div span{color:#9da8ac;font-size:12px}.recommend{font-size:12px;padding:5px 8px;border:1px solid #3f4a4e;border-radius:999px;color:#cad1d3}
        .samples{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:12px 0}.samples img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:8px;background:#0f1314}.role-select{display:flex;justify-content:space-between;align-items:center;gap:10px}.role-select span{color:#aeb7bb;font-size:13px}.role-select select{min-width:160px;padding:8px;border-radius:9px}
        .confirm-bar{display:flex;justify-content:space-between;gap:18px;align-items:center;margin:18px 0;padding:16px;border:1px solid #435055;border-radius:15px;background:#1b2224}.confirm-bar>div{display:flex;flex-direction:column;gap:4px}.confirm-bar span{color:#9da8ac;font-size:13px}.confirm-bar button{font-weight:900}.confirm-bar.bottom{margin-top:28px}
        .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.summary div{padding:14px;border:1px solid #333d41;border-radius:13px;background:#171c1e}.summary span{display:block;color:#98a3a7;font-size:13px}.summary b{font-size:24px;display:block;margin-top:4px}.edit-actions{display:flex;justify-content:space-between;gap:10px;margin:12px 0}.action-pair{display:flex;gap:8px;flex-wrap:wrap}.export{background:#edf1f2;color:#111719;font-weight:900}
        .image-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.image-card{overflow:hidden;border:1px solid #354044;border-radius:16px;background:#171c1e}.image-card.crop{border-color:#8a7546}.image-card.bad{border-color:#694549}.image-wrap{position:relative;aspect-ratio:4/5;background:#0e1213;display:flex;align-items:center;justify-content:center;overflow:hidden}.image-wrap img{width:100%;height:100%;object-fit:contain}.crop-mask{position:absolute;left:0;top:0;width:100%;display:grid;place-items:center;background:rgba(190,135,24,.46);border-bottom:2px dashed #ffd981;font-weight:900;color:white;text-shadow:0 1px 2px #000}.exclude-mask{position:absolute;inset:0;display:grid;place-items:center;background:rgba(64,20,24,.62);font-size:24px;font-weight:900}
        .card-body{padding:12px}.file-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.state-buttons{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}.state-buttons button{padding:9px 5px;min-height:40px;font-size:12px}.state-buttons button.selected{background:#eef2f3;color:#121719;border-color:#eef2f3;font-weight:900}.crop-control{border-top:1px solid #333d41;margin-top:12px;padding-top:12px}.crop-control>div:first-child{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.crop-control span{font-size:11px;color:#919ca0;text-align:right}.crop-control input{width:100%;margin:12px 0}.presets{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.presets button{padding:6px 4px;min-height:34px;font-size:11px}.save{width:100%;margin-top:8px;background:#e9eef0;color:#111719;font-weight:900}
        .size-reference{margin-top:26px;padding:15px;border:1px solid #394448;border-radius:14px;background:#151a1c}.size-reference summary{cursor:pointer;font-weight:900}.size-reference p{color:#aeb7bb}.reference-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.reference-grid img{width:100%;max-height:360px;object-fit:contain;border-radius:10px;background:#0e1213}
        .next-stage{display:flex;flex-direction:column;gap:5px;margin-top:14px;padding:16px;border:1px dashed #4b585d;border-radius:14px;background:#151a1c}.next-stage span{color:#aeb7bb;font-size:13px}.empty{padding:48px 20px;text-align:center;border:1px dashed #465256;border-radius:16px;color:#bac2c5;margin-top:18px}.empty p{margin-bottom:0}.guide{margin-top:22px;padding:18px;border:1px solid #333d41;border-radius:15px;background:#151a1c}.guide h2{margin-top:0;font-size:18px}.guide p{margin:7px 0;color:#b4bdc0;line-height:1.6}
        @media(max-width:850px){.image-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.flow{grid-template-columns:repeat(2,1fr)}.folder-list{grid-template-columns:1fr}}
        @media(max-width:560px){.registration-helper{padding:20px 12px 60px}header{display:block}h1{font-size:27px}.privacy{display:inline-block;margin-top:14px}.flow{grid-template-columns:1fr 1fr}.flow>div{padding:10px}.flow small{display:none}.uploader{align-items:stretch;flex-direction:column}.section-head{display:block}.section-head>b{display:block;text-align:left;margin-top:8px}.samples{grid-template-columns:repeat(4,1fr)}.role-select{align-items:stretch;flex-direction:column}.role-select select{width:100%}.confirm-bar{align-items:stretch;flex-direction:column}.confirm-bar button{width:100%}.summary{grid-template-columns:1fr 1fr}.edit-actions{flex-direction:column}.edit-actions button,.action-pair{width:100%}.action-pair{flex-direction:column}.action-pair button{width:100%}.image-grid{grid-template-columns:1fr}.crop-control>div:first-child{display:block}.crop-control span{display:block;text-align:left;margin-top:4px}.reference-grid{grid-template-columns:1fr 1fr}}
      `}</style>
    </main>
  );
}
