export function stripAddressPrefix(address: string): string {
  if (address.startsWith("inet://") || address.startsWith("unix://")) {
    return address.slice(7);
  }
  return address;
}
