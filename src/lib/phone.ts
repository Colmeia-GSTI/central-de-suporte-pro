// Fonte única de formatação de telefone (BR). Null-safe e remove o DDI 55
// quando presente, para não truncar números vindos do WhatsApp/Asaas.
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  let numbers = value.replace(/\D/g, "");

  // Remove DDI do Brasil (55) quando vier com 12-13 dígitos, para não truncar errado
  if ((numbers.length === 12 || numbers.length === 13) && numbers.startsWith("55")) {
    numbers = numbers.slice(2);
  }

  if (numbers.length === 0) return "";
  if (numbers.length <= 2) return `(${numbers}`;
  if (numbers.length <= 6) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;

  if (numbers.length <= 10) {
    // Fixo: (00) 0000-0000
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6, 10)}`;
  }
  // Celular: (00) 00000-0000
  return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
}

export function stripPhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function isPhoneValid(value: string): boolean {
  const d = stripPhone(value);
  return d.length === 10 || d.length === 11;
}
