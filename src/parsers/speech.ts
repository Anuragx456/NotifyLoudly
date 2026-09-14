export function buildSpeechText(
  amountPaise: number,
  sender: string | null,
  localeTag: string = "en-IN",
): string {
  const cleanSender = sender?.trim() ?? "";
  if (localeTag.toLowerCase().startsWith("hi")) {
    const rupees = Math.floor(amountPaise / 100);
    const remainder = amountPaise % 100;
    let amount = `${rupees} रुपये`;
    if (remainder > 0) {
      amount += ` और ${remainder} पैसे`;
    }
    return cleanSender.length > 0
      ? `${cleanSender} से ${amount} प्राप्त हुए`
      : `${amount} प्राप्त हुए`;
  }
  const rupees = Math.floor(amountPaise / 100);
  const remainder = amountPaise % 100;
  let text = `Received ${rupees} rupees`;
  if (remainder > 0) {
    text += ` and ${remainder} paise`;
  }
  if (cleanSender.length > 0) {
    text += ` from ${cleanSender}`;
  }
  return text;
}
