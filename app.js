"use strict";
const REFRESH_MS = 60000;
const STALE_MIN = 5;
const sortKey = {};          // {themeNo: "rate"|"tv"} — 구성종목 정렬 기준 (스펙 §7)
const openSet = new Set();   // 펼쳐진 테마 no (60초 재렌더 후에도 유지)
let lastData = null;

function dataUrl() {
  const h = location.hostname;
  if (h.endsWith(".github.io")) {
    const user = h.split(".")[0];
    const repo = location.pathname.split("/").filter(Boolean)[0];
    return `https://raw.githubusercontent.com/${user}/${repo}/data/data.json`;
  }
  return "./data.json"; // 로컬 테스트
}

const fmtPct = (v) => v == null ? "-" :
  `<span class="${v > 0 ? "up" : v < 0 ? "down" : ""}">${v > 0 ? "+" : ""}${v.toFixed(1)}%</span>`;
const fmtEok = (v) => v == null ? "-" : Math.round(v).toLocaleString("ko-KR");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));

function leaderHtml(l, judeok) {
  const marks = judeok ? (l.isCap ? "🔴" : "") + (l.isBigTv ? "💰" : "") : "";
  return `<span class="ldr">${esc(l.name)} ${fmtPct(l.rate)}${marks}</span>`;
}

// 구성종목 상세: 정렬 토글 바 + 정렬된 종목 표 (스펙 §7 등락률·거래대금 토글)
function detailInner(t) {
  const key = sortKey[t.no] || "rate";
  const stocks = t.stocks.slice().sort((a, b) =>
    key === "tv" ? b.tvEok - a.tvEok : b.rate - a.rate);
  const btn = (k, label) =>
    `<button class="sortbtn${key === k ? " on" : ""}" data-no="${t.no}" data-key="${k}">${label}</button>`;
  const rows = stocks.map((s) => `
    <tr class="stock">
      <td></td>
      <td class="left">${s.isCap ? "🔴" : ""}<a href="https://m.stock.naver.com/domestic/stock/${esc(s.code)}/total" target="_blank" rel="noopener">${esc(s.name)}</a></td>
      <td>${s.price.toLocaleString("ko-KR")}</td>
      <td>${fmtPct(s.rate)}</td>
      <td colspan="2">대금 ${fmtEok(s.tvEok)}억</td>
      <td colspan="3">시총 ${fmtEok(s.capEok)}억</td>
    </tr>`).join("");
  return `<div class="sortbar">정렬: ${btn("rate", "등락률순")} ${btn("tv", "거래대금순")}</div><table>${rows}</table>`;
}

function stockRows(t) {
  const open = openSet.has(t.no) ? " open" : "";
  return `<tr class="detail${open}" data-no="${t.no}"><td colspan="9">${detailInner(t)}</td></tr>`;
}

function render(d) {
  lastData = d;
  const meta = document.getElementById("meta");
  const upd = new Date(d.updatedAt);
  const ageMin = Math.floor((Date.now() - upd.getTime()) / 60000);
  const stale = ageMin > STALE_MIN
    ? ` <span class="stale">⚠ ${ageMin}분 전 데이터</span>` : "";
  const errs = d.status && !d.status.ok
    ? ` <span class="stale">⚠ 수집 오류 ${d.status.errors.length}건</span>` : "";
  meta.innerHTML = `${upd.toLocaleTimeString("ko-KR")} 기준 · ${esc(d.marketStatus)}${stale}${errs}`;

  document.getElementById("rows").innerHTML = d.themes.map((t, i) => `
    <tr class="theme" data-no="${t.no}">
      <td>${i + 1}</td>
      <td class="left name">${esc(t.name)}${t.capCount ? " 🔴×" + t.capCount : ""}</td>
      <td class="score">${t.score.toFixed(1)}</td>
      <td>${fmtPct(t.changeRate)}</td>
      <td>${t.rise}/${t.steady}/${t.fall}</td>
      <td>${fmtEok(t.tradingValueEok)}</td>
      <td>${t.streakDays >= 2 ? "🔥" + t.streakDays + "일" : t.streakDays + "일"}</td>
      <td class="left">${t.naverLeaders.map((l) => leaderHtml(l, false)).join(" ")}</td>
      <td class="left">${t.judeokLeaders.map((l) => leaderHtml(l, true)).join(" ")}</td>
    </tr>
    ${stockRows(t)}`).join("");
}

// 클릭 위임(#rows에 1회만 바인딩) — 재렌더로 행이 교체돼도 핸들러 유지.
// 테마 행 클릭=펼침 토글, 정렬 버튼 클릭=해당 상세만 재정렬(펼침·다른 테마 정렬 상태 보존).
document.getElementById("rows").addEventListener("click", (e) => {
  const sbtn = e.target.closest("button.sortbtn");
  if (sbtn) {
    const no = Number(sbtn.dataset.no);
    sortKey[no] = sbtn.dataset.key;
    const t = lastData && lastData.themes.find((x) => x.no === no);
    const cell = document.querySelector(`tr.detail[data-no="${no}"] td`);
    if (t && cell) cell.innerHTML = detailInner(t);
    return;
  }
  const row = e.target.closest("tr.theme");
  if (row) {
    const no = Number(row.dataset.no);
    const det = document.querySelector(`tr.detail[data-no="${no}"]`);
    if (det.classList.toggle("open")) openSet.add(no); else openSet.delete(no);
  }
});

async function load() {
  const err = document.getElementById("err");
  try {
    const r = await fetch(`${dataUrl()}?ts=${Date.now()}`, {cache: "no-store"});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    render(await r.json());
    err.classList.add("hidden");
  } catch (e) {
    err.textContent = `데이터 로드 실패: ${e.message}`;
    err.classList.remove("hidden");
  }
}

load();
setInterval(load, REFRESH_MS);
