function googleTranslateElementInit(){
  new google.translate.TranslateElement({pageLanguage:"fr",includedLanguages:"fr,en,ar,es,pt,sw,ha,yo,bm,zh-CN",autoDisplay:false},"google_translate_element");
}
function setLangYAM(l){
  var h=location.hostname, past="expires=Thu, 01 Jan 1970 00:00:00 GMT";
  if(l==="fr"){
    document.cookie="googtrans=;"+past+";path=/";
    document.cookie="googtrans=;"+past+";path=/;domain="+h;
  }else{
    document.cookie="googtrans=/fr/"+l+";path=/";
    document.cookie="googtrans=/fr/"+l+";path=/;domain="+h;
  }
  try{ localStorage.setItem("gt_lang",l); }catch(e){}
  location.reload();
}
(function(){
  var st=document.createElement("style");
  st.textContent=".skiptranslate iframe,.goog-te-banner-frame{display:none!important}body{top:0!important}#goog-gt-tt{display:none!important}";
  document.head.appendChild(st);
  var d=document.createElement("div");
  d.id="google_translate_element"; d.style.display="none";
  document.body.appendChild(d);
  try{
    var l=localStorage.getItem("gt_lang"), sel=document.getElementById("langSel");
    if(l&&sel) sel.value=l;
  }catch(e){}
  var s=document.createElement("script");
  s.src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  document.body.appendChild(s);
})();
