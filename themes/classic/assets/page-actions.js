// Page-header actions — thin glue over wui. The "Copy page" button and its dropdown
// (Copy / View as Markdown / Open in AI) are server-rendered markup enhanced by
// wui.copy (data-copy-url) and wui.menu (data-menu="#page-menu"); none of that needs
// JS here. The ONE thing wui can't do declaratively is the two AI links, whose href
// is an absolute Markdown URL + an encoded prompt — the model fetches the page itself.
// Reading-page only; no-ops cleanly when the header is absent.
(function () {
  "use strict";
  var host = document.querySelector("[data-page-actions]");
  if (!host) return;

  var mdUrl = host.getAttribute("data-md-url");
  var title = host.getAttribute("data-title") || document.title;
  if (!mdUrl) return;

  // Absolute, so an external LLM can fetch it (export doesn't know the final domain;
  // we resolve against location.href in the browser).
  var absMd = new URL(mdUrl, location.href).href;
  var prompt =
    "Read " + absMd + " — the documentation page \"" + title +
    "\" — so I can ask you questions about it.";
  var q = encodeURIComponent(prompt);

  var urls = {
    chatgpt: "https://chatgpt.com/?q=" + q,
    claude: "https://claude.ai/new?q=" + q,
  };
  document.querySelectorAll("#page-menu [data-ai]").forEach(function (a) {
    var u = urls[a.getAttribute("data-ai")];
    if (u) a.href = u;
  });
})();
