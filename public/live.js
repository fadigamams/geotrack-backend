(function(){
var map=null,tm=null,did=null;
function css(){if(document.getElementById('liveCss'))return;var s=document.createElement('style');s.id='liveCss';
s.textContent='#liveBox{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#0b1220;overflow:hidden}#liveStage{position:absolute;z-index:1;top:0;left:0;right:0;bottom:0;perspective:520px;overflow:hidden}#liveMap{position:absolute;left:50%;top:42%;width:1400px;height:1400px;margin:-700px 0 0 -700px;transition:transform .9s linear}#liveCar{position:fixed;z-index:2;left:calc(50vw - 16px);top:calc(42vh - 24px);margin:0;border-left:16px solid transparent;border-right:16px solid transparent;border-bottom:46px solid #1d6bff;filter:drop-shadow(0 4px 6px #000)}#liveHud{position:absolute;z-index:3;left:0;right:0;bottom:0;padding:14px 16px;background:#0b1220;color:#fff;font:600 15px sans-serif}#liveSpd{font-size:34px}#liveX{position:fixed;top:12px;right:12px;z-index:4;padding:10px 14px;border:0;border-radius:10px;background:#fff;font-weight:700}';
document.head.appendChild(s);}
function html(){return '<button id="liveX">Fermer</button><div id="liveStage"><div id="liveMap"></div></div><div id="liveCar"></div><div id="liveHud"><div id="liveSpd">-- km/h</div><div id="liveInfo">Recherche du livreur...</div></div>';}
async function tick(){try{var d=await api('/api/deliveries/'+did+'/live');var info=document.getElementById('liveInfo');if(info===null){return;}
if(d.live===true){var p=d.position;map.setView([p.lat,p.lng],17,{animate:false});document.getElementById('liveMap').style.transform='rotateX(55deg) rotate('+(-(p.heading||0))+'deg)';var age=Math.round((Date.now()-new Date(p.updated_at).getTime())/1000);var fresh=age<=30;document.getElementById('liveSpd').textContent=(fresh?Math.round((p.speed||0)*3.6):0)+' km/h';document.getElementById('liveCar').style.borderBottomColor=fresh?'#1d6bff':'#8a8f98';info.textContent=(p.name||'Livreur')+(p.is_demo?' - DEMO':'')+(fresh?' - en direct':' - HORS LIGNE, derniere position il y a '+(age>=120?Math.round(age/60)+' min':age+' s'));}
else{info.textContent='Suivi indisponible (livraison non en cours, ou livreur sans position)';}}catch(e){}}
function stop(){if(tm){clearInterval(tm);tm=null;}if(map){map.remove();map=null;}var b=document.getElementById('liveBox');if(b){b.remove();}}
window.yamLive=function(id){stop();css();did=id;var b=document.createElement('div');b.id='liveBox';b.innerHTML=html();document.body.appendChild(b);
document.getElementById('liveX').addEventListener('click',stop);
map=L.map('liveMap',{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,touchZoom:false,doubleClickZoom:false}).setView([5.35,-4.0],17);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
tick();tm=setInterval(tick,5000);};
})();
