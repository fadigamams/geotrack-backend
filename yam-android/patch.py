p='android/app/src/main/AndroidManifest.xml'
s=open(p).read()
P='android.permission.'
perms=''
for n in ['READ_CONTACTS','ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION','ACCESS_BACKGROUND_LOCATION','FOREGROUND_SERVICE','FOREGROUND_SERVICE_LOCATION','POST_NOTIFICATIONS','WAKE_LOCK']:
    perms+='<uses-permission android:name="'+P+n+'" />\n'
svc='<service android:name="com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService" android:enabled="true" android:exported="true" android:foregroundServiceType="location" />\n'
assert s.count('<application')==1
s=s.replace('<application',perms+'<application',1)
s=s.replace('</application>',svc+'</application>',1)
open(p,'w').write(s)
