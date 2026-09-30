self.addEventListener('push', function(e){
  var d={title:'YAM',body:'Nouveau message'};
  try{ d=e.data.json(); }catch(x){}
  e.waitUntil(self.registration.showNotification(d.title,{body:d.body,vibrate:[200,100,200],tag:'yam-'+(d.convId||'msg'),renotify:true}));
});
self.addEventListener('notificationclick', function(e){ e.notification.close(); e.waitUntil(clients.openWindow('/')); });
