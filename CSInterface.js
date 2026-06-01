/* DokMotion CSInterface — minimal shim til CEP/AE */
(function(){
  function CSInterface(){}
  CSInterface.prototype.evalScript = function(script, callback){
    try {
      if (window.__adobe_cep__ && typeof window.__adobe_cep__.evalScript === 'function') {
        window.__adobe_cep__.evalScript(script, callback || function(){});
        return;
      }
    } catch(e) {}
    if (typeof callback === 'function') callback('EvalScript error.');
  };
  CSInterface.prototype.openURLInDefaultBrowser = function(url){
    try {
      if (window.cep && window.cep.util && typeof window.cep.util.openURLInDefaultBrowser === 'function') {
        return window.cep.util.openURLInDefaultBrowser(url);
      }
      if (window.__adobe_cep__ && typeof window.__adobe_cep__.openURLInDefaultBrowser === 'function') {
        return window.__adobe_cep__.openURLInDefaultBrowser(url);
      }
    } catch(e) {}
    try { window.open(url, '_blank'); } catch(_e) {}
    return false;
  };
  window.CSInterface = CSInterface;
})();
