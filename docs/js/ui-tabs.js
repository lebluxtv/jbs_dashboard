/******************************************************************
   *                             🧭 TABS
   ******************************************************************/
  function showTab(name){
    $$(".tab").forEach(btn => {
      const act = btn.dataset.tab === name;
      btn.classList.toggle("active", act);
      btn.setAttribute("aria-selected", act ? "true" : "false");
    });
    $$(".tab-panel").forEach(p => {
      p.style.display = (p.id === ('tab-' + name)) ? "block" : "none";
    });
    try { localStorage.setItem("jbs.activeTab", name); } catch {}
  }
  $$(".tab").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
  (function initTab(){ let initial="overview"; try { initial = localStorage.getItem("jbs.activeTab") || "overview"; } catch {} showTab(initial); })();

  
