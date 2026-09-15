# WorkManager instantiates UpiHealthWorker via reflection (WorkerFactory), so
# release minification must keep its (Context, WorkerParameters) constructor —
# otherwise the periodic health check silently dies in release builds only.
-keep public class com.notifyloudly.upilistener.UpiHealthWorker {
  public <init>(android.content.Context, androidx.work.WorkerParameters);
}
