package com.notifyloud.upilistener

object UpiAnnounceGate {
  const val WINDOW_MS = 10 * 60 * 1000L
  private const val MAX_ENTRIES = 500
  private const val MAX_PAISA = 1_000_000_000L

  private val lock = Any()
  private val seen = mutableMapOf<String, Long>()

  private val amountRe = Regex("""(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)""")
  private val receivedFromRe =
    Regex("""received\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+from\s+([A-Za-z0-9 .'\-&()]{1,60})""", RegexOption.IGNORE_CASE)
  private val creditedRe =
    Regex("""credited\s+(?:with\s+)?(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+(?:from|by)\s+([A-Za-z0-9 .'\-&()]{1,60})""", RegexOption.IGNORE_CASE)
  private val moneyReceivedRe =
    Regex("""(?:money|payment|amount)\s+received""", RegexOption.IGNORE_CASE)
  private val hindiIncomingRe =
    Regex("""(?:प्राप्त|जमा|क्रेडिट)""")
  // "You have sent ₹X (to …)" / "You've sent ₹X (to …)" — the sender is
  // you, so this is ALWAYS outgoing, even though "have sent ₹X" alone looks
  // like an incoming credit (cf. hasSentRe). Checked before everything else:
  // a false "received" announcement for money you sent is worse than silence.
  private val youHaveSentRe =
    Regex("""\byou(?:'ve|\s+have)\s+sent\s+(?:₹|Rs\.?|INR)""", RegexOption.IGNORE_CASE)
  // "Aman sent ₹1 to you." — PhonePe chat-style credit. The generic
  // sent/debited outgoing pattern matches "sent ₹1", so this incoming form
  // must be checked BEFORE the outgoing list (see decide()).
  private val toYouRe =
    Regex("""(?:sent|paid|transferred)\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+to\s+you\b""", RegexOption.IGNORE_CASE)
  // "AMAN has sent ₹1 to your bank account …" — PhonePe transactional credit.
  // Like toYouRe, the recipient is you, so it must beat the outgoing list.
  private val hasSentRe =
    Regex("""(?:has|have)\s+sent\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?""", RegexOption.IGNORE_CASE)
  private val genericTitleWords =
    Regex("""payment|received|credited|sent|paid|success|notification|phonepe|gpay|paytm|bhim""", RegexOption.IGNORE_CASE)
  private val genericIncomingRe =
    Regex("""(?:received|credited)""", RegexOption.IGNORE_CASE)
  // Recipient guards: "…to you / to your bank account" means YOU received —
  // never outgoing. Without them, "sent ₹1 to your bank account" matches the
  // sent/debited pattern and genuine credits go silent.
  private const val SELF_RECIPIENT_GUARD = """(?!\s+to\s+you\b)(?!\s+to\s+your\b)"""
  private val outgoingRes = listOf(
    Regex("""paid\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?$SELF_RECIPIENT_GUARD\s+to\s+(?!you\b|your\b)""", RegexOption.IGNORE_CASE),
    Regex("""(?:sent|debited|transferred)(?:\s+\w+){0,4}\s+(?:₹|Rs\.?|INR)\s*[\d,]+$SELF_RECIPIENT_GUARD""", RegexOption.IGNORE_CASE),
    Regex("""payment\s+(?:of\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+)?(?:successful|completed|done)\s+to\s+(?!you\b|your\b)""", RegexOption.IGNORE_CASE)
  )
  private val senderCutRe =
    Regex("""\s+(?:on|via|through|using|to|at|from)\s+""", RegexOption.IGNORE_CASE)
  // Amounts preceded (within a short window) by balance language belong to
  // the account balance, not the payment — e.g. "Balance ₹12,000. Received
  // ₹500 from Aman" must announce ₹500, not ₹12,000.
  private val balanceContextRe =
    Regex("""balance|avail|closing|total\s+due""", RegexOption.IGNORE_CASE)
  private const val BALANCE_WINDOW = 15
  // Fallback for notifications without a currency symbol ("Received 500
  // from Aman"). Fires only when no symbol-amount exists: an explicit
  // incoming phrase must be present and no outgoing signal. Always
  // lower-trust than a symbol-amount parse.
  private val bareIncomingRe =
    Regex("""(?:money|payment|amount)\s+received|received\s+\d|credited\s+\d|(?:sent|paid|transferred)\s+\d+(?:\.\d{1,2})?\s+to\s+you\b|(?:has|have)\s+sent\s+\d|प्राप्त|जमा|क्रेडिट""", RegexOption.IGNORE_CASE)
  private val bareOutgoingRe =
    Regex("""(?:you(?:'ve|\s+have)\s+sent\s+\d|paid\s+\d+\s+to\s+(?!you\b|your\b)|(?:sent|debited|transferred)\s+\d+(?!\s+to\s+you\b)(?!\s+to\s+your\b)|payment\s+(?:of\s+\d+\s+)?(?:successful|completed|done)\s+to\s+(?!you\b|your\b))""", RegexOption.IGNORE_CASE)
  private val dateLikeRe = Regex("""\d{1,2}[-/]\d{1,2}[-/]\d{2,4}""")
  private val bareAmountRe = Regex("""(?<![\d₹\w,.])(\d{1,9}(?:\.\d{1,2})?)(?![\d])""")
  private val bareReceivedFromRe =
    Regex("""received\s+\d+(?:\.\d{1,2})?\s+from\s+([A-Za-z0-9 .'\-&()]{1,60})""", RegexOption.IGNORE_CASE)
  private val bareCreditedRe =
    Regex("""credited\s+(?:with\s+)?\d+(?:\.\d{1,2})?\s+(?:from|by)\s+([A-Za-z0-9 .'\-&()]{1,60})""", RegexOption.IGNORE_CASE)
  private val bareSentToYouRe =
    Regex("""(.{1,40}?)\s+sent\s+\d+(?:\.\d{1,2})?\s+to\s+you\b""", RegexOption.IGNORE_CASE)

  data class Decision(
    val speak: Boolean,
    val text: String?,
    val reason: String,
    val amountPaise: Long? = null,
    val sender: String? = null,
    val appName: String = "",
    val sourcePackage: String = ""
  )

  private val appNames = mapOf(
    "com.google.android.apps.nbu.paisa.user" to "Google Pay",
    "com.phonepe.app" to "PhonePe",
    "net.one97.paytm" to "Paytm",
    "in.org.npci.upiapp" to "BHIM"
  )

  fun decide(
    packageName: String,
    title: String,
    text: String,
    bigText: String,
    subText: String,
    postedAt: Long,
    allowlisted: Boolean,
    nowMs: Long = System.currentTimeMillis()
  ): Decision {
    if (!allowlisted) {
      return Decision(false, null, "not-allowlisted")
    }
    val combined = listOf(title, text, bigText, subText)
      .filter { it.isNotBlank() }
      .joinToString(" ")
      .replace(Regex("""\s+"""), " ")
      .trim()
    if (combined.isEmpty()) {
      return Decision(false, null, "empty-text")
    }
    if (youHaveSentRe.containsMatchIn(combined)) {
      return Decision(false, null, "outgoing")
    }
    val toYou = toYouRe.containsMatchIn(combined)
    val hasSent = hasSentRe.containsMatchIn(combined)
    if (!toYou && !hasSent && outgoingRes.any { it.containsMatchIn(combined) }) {
      return Decision(false, null, "outgoing")
    }

    var paise = firstAmountPaise(combined)
    var bareSender: String? = null
    var bareFallback = false
    if (paise == null) {
      if (bareOutgoingRe.containsMatchIn(combined)) {
        return Decision(false, null, "outgoing")
      }
      val bare = firstBareAmount(combined)
      if (bare != null && bareIncomingRe.containsMatchIn(combined)) {
        paise = bare.first
        bareSender = bare.second
        bareFallback = true
      } else {
        return Decision(false, null, "no-amount")
      }
    }
    val resolvedPaise = paise ?: return Decision(false, null, "no-amount")
    val receivedMatch = receivedFromRe.find(combined)
    val creditedMatch = if (receivedMatch == null) creditedRe.find(combined) else null
    val sender = cleanSender((receivedMatch ?: creditedMatch)?.groupValues?.get(1))
      ?: if (hasSent) senderFromHasSent(combined) else null
      ?: if (toYou) senderFromTitle(title) else null
      ?: bareSender
    val matched = toYou || hasSent || receivedMatch != null || creditedMatch != null ||
      moneyReceivedRe.containsMatchIn(combined) || hindiIncomingRe.containsMatchIn(combined) ||
      genericIncomingRe.containsMatchIn(combined) || bareFallback
    if (!matched) {
      return Decision(false, null, "amount-without-context")
    }

    val normalizedSender = (sender ?: "").lowercase().replace(Regex("""[^a-z0-9]"""), "")
    val bucket = postedAt / WINDOW_MS
    val currentKey = "$resolvedPaise|$normalizedSender|$bucket"
    val previousKey = "$resolvedPaise|$normalizedSender|${bucket - 1}"
    synchronized(lock) {
      pruneLocked(nowMs)
      if (seen.containsKey(currentKey) || seen.containsKey(previousKey)) {
        return Decision(false, null, "duplicate")
      }
      seen[currentKey] = nowMs
    }
    return Decision(
      speak = true,
      text = buildAnnouncement(resolvedPaise, sender),
      reason = if (bareFallback) "ok-bare" else "ok",
      amountPaise = resolvedPaise,
      sender = sender,
      appName = appNames[packageName] ?: packageName,
      sourcePackage = packageName
    )
  }

  fun reset() {
    synchronized(lock) { seen.clear() }
  }

  private fun pruneLocked(nowMs: Long) {
    if (seen.size <= MAX_ENTRIES) return
    val expired = seen.filterValues { nowMs - it > WINDOW_MS }.keys
    expired.forEach { seen.remove(it) }
  }

  private fun firstAmountPaise(combined: String): Long? {
    for (match in amountRe.findAll(combined)) {
      val windowStart = maxOf(0, match.range.first - BALANCE_WINDOW)
      if (balanceContextRe.containsMatchIn(combined.substring(windowStart, match.range.first))) {
        continue
      }
      toPaise(match.groupValues[1])?.let { return it }
    }
    return null
  }

  private fun bareSenderExtract(combined: String): String? {
    val bareReceived = bareReceivedFromRe.find(combined)
    val bareCredited = if (bareReceived == null) bareCreditedRe.find(combined) else null
    val bareSent = if (bareReceived == null && bareCredited == null) bareSentToYouRe.find(combined) else null
    val raw = bareReceived?.groupValues?.get(1)
      ?: bareCredited?.groupValues?.get(1)
      ?: bareSent?.groupValues?.get(1)
    return cleanSender(raw)
  }

  private fun firstBareAmount(combined: String): Pair<Long, String?>? {
    val deDated = dateLikeRe.replace(combined, " ")
    for (match in bareAmountRe.findAll(deDated)) {
      toPaise(match.groupValues[1])?.let { return it to bareSenderExtract(combined) }
    }
    return null
  }

  private fun toPaise(numStr: String): Long? {
    val normalized = numStr.replace(",", "")
    if (!Regex("""^\d+(\.\d{1,2})?$""").matches(normalized)) return null
    val paise = Math.round(normalized.toDouble() * 100)
    if (paise <= 0 || paise > MAX_PAISA) return null
    return paise
  }

  private fun cleanSender(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    val beforeColon = raw.substringBefore(":").trim().ifEmpty { raw.trim() }
    val cleaned = senderCutRe.split(beforeColon, 2)[0].trim().trimEnd('.', ',', '。', ';')
    return if (cleaned.isEmpty()) null else cleaned
  }

  private fun senderFromTitle(title: String): String? {
    val candidate = title.substringBefore(":").trim().take(40).trim()
    if (candidate.isEmpty() || genericTitleWords.containsMatchIn(candidate)) return null
    return cleanSender(candidate)
  }

  private fun stripGenericTitle(raw: String): String? {
    val cleaned = cleanSender(raw) ?: return null
    return if (genericTitleWords.containsMatchIn(cleaned)) null else cleaned
  }

  private fun senderFromHasSent(combined: String): String? {
    // "Money received AMAN TAMRAKAR has sent ₹1 …" — take the trailing words
    // before "has sent", dropping generic context words.
    val idx = hasSentRe.find(combined)?.range?.first ?: return null
    val before = combined.substring(0, idx).trim()
    if (before.isEmpty()) return null
    val stop = setOf("money", "payment", "amount", "received", "credited", "your", "bank", "account", "you")
    val words = before.split(Regex("""\s+""")).filter { it.isNotEmpty() }.takeLast(4)
    val name = words.filter { it.lowercase().trim('.', ',', ';', ':') !in stop }.joinToString(" ")
    return stripGenericTitle(name.take(40))
  }

  fun buildAnnouncement(
    paise: Long,
    sender: String?,
    localeTag: String = UpiListenerStore.localeTag
  ): String {
    if (localeTag.startsWith("hi", ignoreCase = true)) {
      val rupees = paise / 100
      val remainder = (paise % 100).toInt()
      val amount = StringBuilder("$rupees रुपये")
      if (remainder > 0) {
        amount.append(" और $remainder पैसे")
      }
      return if (!sender.isNullOrBlank()) {
        "$sender से $amount प्राप्त हुए"
      } else {
        "$amount प्राप्त हुए"
      }
    }
    val rupees = paise / 100
    val remainder = (paise % 100).toInt()
    val base = StringBuilder("Received $rupees rupees")
    if (remainder > 0) {
      base.append(" and $remainder paise")
    }
    if (!sender.isNullOrBlank()) {
      base.append(" from $sender")
    }
    return base.toString()
  }
}
