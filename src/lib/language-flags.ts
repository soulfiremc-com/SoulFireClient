import {
  AZ,
  BR,
  CN,
  CZ,
  DE,
  ES,
  FI,
  FR,
  ID,
  IN,
  IT,
  JP,
  KR,
  NL,
  PL,
  RU,
  SE,
  SK,
  TH,
  TR,
  TW,
  UA,
  US,
  VN,
} from "country-flag-icons/react/3x2";

type FlagComponent = typeof US;

// Import only the flags of shipped locales. The full flag set adds about
// 230 KB to the startup bundle.
const FLAGS: Record<string, FlagComponent> = {
  AZ,
  BR,
  CN,
  CZ,
  DE,
  ES,
  FI,
  FR,
  ID,
  IN,
  IT,
  JP,
  KR,
  NL,
  PL,
  RU,
  SE,
  SK,
  TH,
  TR,
  TW,
  UA,
  US,
  VN,
};

export function getLanguageFlag(locale: string): FlagComponent | undefined {
  const countryCode = locale.split("-")[1];
  return countryCode ? FLAGS[countryCode] : undefined;
}
