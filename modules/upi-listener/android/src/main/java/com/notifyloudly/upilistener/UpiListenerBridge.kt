package com.notifyloudly.upilistener

object UpiListenerBridge {
  private const val MAX_PENDING = 50

  private val notificationObservers = mutableSetOf<(Map<String, Any>) -> Unit>()
  private val announcementObservers = mutableSetOf<(Map<String, Any>) -> Unit>()
  private val connectionObservers = mutableSetOf<(Boolean) -> Unit>()
  private val pending = ArrayDeque<Map<String, Any>>()

  @Synchronized
  fun addNotificationObserver(observer: (Map<String, Any>) -> Unit) {
    notificationObservers.add(observer)
  }

  @Synchronized
  fun removeNotificationObserver(observer: (Map<String, Any>) -> Unit) {
    notificationObservers.remove(observer)
  }

  @Synchronized
  fun addConnectionObserver(observer: (Boolean) -> Unit) {
    connectionObservers.add(observer)
  }

  @Synchronized
  fun removeConnectionObserver(observer: (Boolean) -> Unit) {
    connectionObservers.remove(observer)
  }

  @Synchronized
  fun emitNotification(payload: Map<String, Any>) {
    if (notificationObservers.isEmpty()) {
      if (pending.size >= MAX_PENDING) {
        pending.removeFirst()
      }
      pending.addLast(payload)
    } else {
      notificationObservers.toList().forEach { it(payload) }
    }
  }

  @Synchronized
  fun drainPending(): List<Map<String, Any>> {
    val drained = pending.toList()
    pending.clear()
    return drained
  }

  @Synchronized
  fun addAnnouncementObserver(observer: (Map<String, Any>) -> Unit) {
    announcementObservers.add(observer)
  }

  @Synchronized
  fun removeAnnouncementObserver(observer: (Map<String, Any>) -> Unit) {
    announcementObservers.remove(observer)
  }

  @Synchronized
  fun emitAnnouncement(payload: Map<String, Any>) {
    announcementObservers.toList().forEach { it(payload) }
  }

  @Synchronized
  fun emitConnection(connected: Boolean) {
    connectionObservers.toList().forEach { it(connected) }
  }
}
