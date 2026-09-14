package com.notifyloudly.upilistener

object UpiAnnounceGate {
  // Keep in sync with src/parsers/constants.ts (single source of truth is
  // the TS file; this mirror exists because the announce path must work
  // when JS is not running, e.g. right after boot).
  const val WINDOW_MS = 10 * 60 * 1000L
  const val TTL_MS = WINDOW_MS
  // Only for postedAt==0 fallback (see exactPaymentKey) — burst coalesce.
  private const val COALESCE_MS = 30 * 1000L
  private const val STALE_MS = 30 * 60 * 1000L
  // Cross-source suppression window (double-announce fix) — mirrors
  // DEDUP_CROSS_SOURCE_MS in src/parsers/constants.ts. Two notifications for
  // ONE logical payment (UPI app + bank app echo, or post + update) carry
  // different postedAt seconds apart; same amount+sender closer than this
  // speaks once. Genuine repeats ~10s+ apart in postedAt now speak.
  // Tradeoff: echoes landing 10-30s apart may double-announce (accepted to
  // stop swallowing rapid genuine repeats).
  private const val CROSS_SOURCE_WINDOW_MS = 10 * 1000L
  private const val MAX_ENTRIES = 500
  private const val MAX_PAISA = 1_000_000_000L

  private data class PairSeen(val postedAt: Long, val seenAt: Long)

  private val lock = Any()
  // Three tiers: sbn.key (k:...) + exact amount|sender|postedAt (p:...) +
  // amount|sender recency (seenPairAt) for cross-source echo suppression.
  private val seenKey = mutableMapOf<String, Long>()
  private val seenPayment = mutableMapOf<String, Long>()
  // Third tier: last observation per amount|sender WITHOUT postedAt, for
  // cross-source echo suppression (see decide()). postedAt==0 never feeds
  // this map — those bursts already coalesce via the bucket above.
  private val seenPairAt = mutableMapOf<String, PairSeen>()

  private val amountRe = Regex("""(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)""")
  private val receivedFromRe =
    Regex("""received\s+(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+from\s+([\p{L}\p{N} .'\-&()]{1,60})""", RegexOption.IGNORE_CASE)
  private val creditedRe =
    Regex("""credited\s+(?:with\s+)?(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s+(?:from|by)\s+([\p{L}\p{N} .'\-&()]{1,60})""", RegexOption.IGNORE_CASE)
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
    Regex("""received\s+\d+(?:\.\d{1,2})?\s+from\s+([\p{L}\p{N} .'\-&()]{1,60})""", RegexOption.IGNORE_CASE)
  private val bareCreditedRe =
    Regex("""credited\s+(?:with\s+)?\d+(?:\.\d{1,2})?\s+(?:from|by)\s+([\p{L}\p{N} .'\-&()]{1,60})""", RegexOption.IGNORE_CASE)
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

  val APP_NAMES: Map<String, String> = mapOf(
    "com.google.android.apps.nbu.paisa.user" to "Google Pay",
    "com.google.android.apps.nbu.paisa.merchant" to "Google Pay Business",
    "com.phonepe.app" to "PhonePe",
    "com.phonepe.app.business" to "PhonePe Business",
    "net.one97.paytm" to "Paytm",
    "net.one97.paytm.merchant" to "Paytm Business",
    "com.paytmbusiness" to "Paytm Business",
    "in.org.npci.upiapp" to "BHIM",
    "com.naviapp" to "Navi",
    "com.navi.services" to "Navi",
    "com.navi.upi" to "Navi",
    "com.dreamplug.androidapp" to "CRED",
    "in.amazon.mShop.android.shopping" to "Amazon Pay",
    "tech.superpay.app" to "Super.money",
    "com.supermoney.app" to "Super.money",
    "com.sbi.upi" to "BHIM SBI Pay",
    "com.csam.icici.bank.imobile" to "iMobile Pay",
    "com.msf.kbank.mobile" to "Kotak",
    "com.upi.axispay" to "Axis Pay",
    "com.hdfcbank.payzapp" to "PayZapp",
    "com.canarabank.mobility" to "Canara ai1",
    "com.bankofbaroda.upi" to "Baroda Pay",
    "com.bankofbaroda.mconnect" to "bob World"
  )

  fun decide(
    packageName: String,
    title: String,
    text: String,
    bigText: String,
    subText: String,
    postedAt: Long,
    allowlisted: Boolean,
    nowMs: Long = System.currentTimeMillis(),
    sbnKey: String? = null
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

    if (postedAt > 0 && nowMs - postedAt > STALE_MS) {
      return Decision(false, null, "stale")
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
      } else if (hasOutOfRangeSymbolAmount(combined)) {
        return Decision(false, null, "amount-out-of-range")
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

    val normalizedSender =
      (sender?.lowercase()?.replace(Regex("""[^a-z0-9]"""), "")?.ifEmpty { null } ?: "unknown")
    val exactPaymentKey = if (postedAt > 0) {
      "p:$resolvedPaise|$normalizedSender|$postedAt"
    } else {
      "p:$resolvedPaise|$normalizedSender|b:${nowMs / COALESCE_MS}"
    }
    // Composite SBN key mirrors src/parsers/dedup.ts: many UPI apps reuse
    // the same SBN id/tag across payments, so a bare `k:<sbnKey>` would
    // swallow distinct siblings inside the 10-min TTL. Binding it to
    // postedAt (or a 30s coalesce bucket when postedAt==0) keeps true
    // re-deliveries deduped while letting siblings through.
    val prefixedKey = sbnKey?.takeIf { it.isNotBlank() }?.let {
      if (postedAt > 0) "k:$it|$postedAt" else "k:$it|b:${nowMs / COALESCE_MS}"
    }
    val pairKey = "$resolvedPaise|$normalizedSender"
    synchronized(lock) {
      pruneLocked(nowMs)
      if (prefixedKey != null && seenKey.containsKey(prefixedKey)) {
        return Decision(false, null, "duplicate")
      }
      if (seenPayment.containsKey(exactPaymentKey)) {
        return Decision(false, null, "duplicate")
      }
      // Cross-source echo check (see CROSS_SOURCE_WINDOW_MS): same
      // amount+sender with postedAt closer than the window is the same
      // logical payment arriving twice — suppress the second announcement.
      // postedAt distance (not observation distance) is compared, so a victim
      // restart or unrelated traffic between echo halves can never widen the
      // window into swallowing a genuine repeat minutes later.
      if (postedAt > 0) {
        val prev = seenPairAt[pairKey]
        if (prev != null && kotlin.math.abs(postedAt - prev.postedAt) < CROSS_SOURCE_WINDOW_MS) {
          return Decision(false, null, "duplicate")
        }
      }
      if (prefixedKey != null) seenKey[prefixedKey] = nowMs
      seenPayment[exactPaymentKey] = nowMs
      if (postedAt > 0) {
        seenPairAt[pairKey] = PairSeen(postedAt, nowMs)
      }
    }
    return Decision(
      speak = true,
      text = buildAnnouncement(resolvedPaise, sender),
      reason = if (bareFallback) "ok-bare" else "ok",
      amountPaise = resolvedPaise,
      sender = sender,
      appName = APP_NAMES[packageName] ?: packageName,
      sourcePackage = packageName
    )
  }

  fun reset() {
    synchronized(lock) { seenKey.clear(); seenPayment.clear(); seenPairAt.clear(); lastPruneAt = 0L }
  }

  fun seed(key: String, seenAt: Long) {
    synchronized(lock) {
      val prefixed = if (key.startsWith("k:") || key.startsWith("p:")) key else "p:$key"
      if (prefixed.startsWith("p:")) {
        if (!seenPayment.containsKey(prefixed)) {
          seenPayment[prefixed] = seenAt
        }
        // Rebuild cross-source recency too: exact keys embed
        // amount|sender|postedAt, so an echo arriving just after a restart is
        // still suppressed. Bucket keys (postedAt==0, "b:N") carry no usable
        // timestamp and are skipped. Mirrors seedDedupKey in
        // src/parsers/dedup.ts.
        val parts = prefixed.removePrefix("p:").split("|")
        if (parts.size == 3) {
          val postedAt = parts[2].toLongOrNull()
          if (postedAt != null && postedAt > 0) {
            val pair = "${parts[0]}|${parts[1]}"
            val prev = seenPairAt[pair]
            if (prev == null || postedAt > prev.postedAt) {
              seenPairAt[pair] = PairSeen(postedAt, seenAt)
            }
          }
        }
      } else {
        if (!seenKey.containsKey(prefixed)) {
          seenKey[prefixed] = seenAt
        }
      }
      pruneLocked(System.currentTimeMillis())
    }
  }

  @Volatile private var lastPruneAt: Long = 0L
  private fun pruneLocked(nowMs: Long) {
    val due = nowMs - lastPruneAt > 60_000L
    if (seenKey.size + seenPayment.size + seenPairAt.size <= MAX_ENTRIES && !due) return
    lastPruneAt = nowMs
    val expiredKeys = seenKey.filterValues { nowMs - it > TTL_MS }.keys.toList()
    expiredKeys.forEach { seenKey.remove(it) }
    val expiredPayments = seenPayment.filterValues { nowMs - it > TTL_MS }.keys.toList()
    expiredPayments.forEach { seenPayment.remove(it) }
    // Expiry by observation time is safe here: a stale entry can only
    // suppress a payment whose postedAt is seconds from the stale postedAt,
    // which the 30-min stale guard in decide() already rejects.
    val expiredPairs = seenPairAt.filterValues { nowMs - it.seenAt > TTL_MS }.keys.toList()
    expiredPairs.forEach { seenPairAt.remove(it) }
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

  private fun hasOutOfRangeSymbolAmount(combined: String): Boolean {
    for (match in amountRe.findAll(combined)) {
      val windowStart = maxOf(0, match.range.first - BALANCE_WINDOW)
      if (balanceContextRe.containsMatchIn(combined.substring(windowStart, match.range.first))) continue
      val normalized = match.groupValues[1].replace(",", "")
      if (!Regex("""^\d+(\.\d{1,2})?$""").matches(normalized)) continue
      val paise = Math.round(normalized.toDouble() * 100)
      if (paise <= 0 || paise > MAX_PAISA) return true
    }
    return false
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
