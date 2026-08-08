// Abre um documento HTML para impressão de forma confiável em desktop e mobile.
// Desktop: iframe oculto. Mobile: nova aba com auto-print (iframes não imprimem no iOS/Android).
function isMobile() {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const small = window.innerWidth < 768;
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return ua || (coarse && small);
}

const AUTO_PRINT = `<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},350);});<\/script>`;

export function openPrintDocument(html: string) {
  const withScript = html.includes("</body>")
    ? html.replace("</body>", `${AUTO_PRINT}</body>`)
    : html + AUTO_PRINT;

  if (isMobile()) {
    try {
      const blob = new Blob([withScript], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return true;
      }
      URL.revokeObjectURL(url);
      // Popup bloqueado: usa overlay em tela cheia com botão de impressão.
      return openOverlay(withScript);
    } catch {
      return openOverlay(withScript);
    }
  }

  try {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.srcdoc = html;
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      win.focus();
      win.print();
      setTimeout(() => iframe.remove(), 60000);
    };
    document.body.appendChild(iframe);
    return true;
  } catch {
    return false;
  }
}

function openOverlay(html: string) {
  try {
    const host = document.createElement("div");
    host.className = "print-overlay";
    host.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:#fff;display:flex;flex-direction:column";
    const bar = document.createElement("div");
    bar.className = "no-print";
    bar.style.cssText =
      "display:flex;gap:8px;padding:8px;border-bottom:1px solid #cbd5e1;background:#fff";
    const printBtn = document.createElement("button");
    printBtn.textContent = "Imprimir";
    printBtn.style.cssText =
      "flex:1;min-height:44px;background:#4f46e5;color:#fff;border:0;border-radius:8px;font-size:16px";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Fechar";
    closeBtn.style.cssText =
      "flex:1;min-height:44px;background:#e2e8f0;color:#0f172a;border:0;border-radius:8px;font-size:16px";
    const frame = document.createElement("iframe");
    frame.style.cssText = "flex:1;width:100%;border:0";
    frame.srcdoc = html.replace(
      `<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},350);});</script>`,
      "",
    );
    printBtn.onclick = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    };
    closeBtn.onclick = () => host.remove();
    bar.append(printBtn, closeBtn);
    host.append(bar, frame);
    document.body.appendChild(host);
    return true;
  } catch {
    return false;
  }
}
