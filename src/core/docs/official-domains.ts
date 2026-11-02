// Dominios oficiales de fabricantes. Es una lista revisada a mano: un enlace
// solo se marca como «Oficial» si su dominio (o un subdominio) aparece aquí.
// Si un fabricante no está, sus enlaces se muestran como «Otras fuentes».

const REGISTRY: Record<string, { name: string; domains: string[]; aliases?: string[] }> = {
  // Ordenadores y componentes de PC
  asus: { name: "ASUS", domains: ["asus.com"], aliases: ["rog", "republicofgamers", "asustek"] },
  msi: { name: "MSI", domains: ["msi.com"], aliases: ["microstar", "microstarinternational"] },
  gigabyte: { name: "Gigabyte", domains: ["gigabyte.com"], aliases: ["aorus"] },
  asrock: { name: "ASRock", domains: ["asrock.com"] },
  amd: { name: "AMD", domains: ["amd.com"], aliases: ["advancedmicrodevices"] },
  intel: { name: "Intel", domains: ["intel.com"] },
  nvidia: { name: "NVIDIA", domains: ["nvidia.com"] },
  evga: { name: "EVGA", domains: ["evga.com"] },
  corsair: { name: "Corsair", domains: ["corsair.com"] },
  kingston: { name: "Kingston", domains: ["kingston.com"], aliases: ["hyperx"] },
  crucial: { name: "Crucial", domains: ["crucial.com", "micron.com"], aliases: ["micron"] },
  samsung: { name: "Samsung", domains: ["samsung.com"] },
  gskill: { name: "G.Skill", domains: ["gskill.com"] },
  seasonic: { name: "Seasonic", domains: ["seasonic.com"] },
  bequiet: { name: "be quiet!", domains: ["bequiet.com"] },
  coolermaster: { name: "Cooler Master", domains: ["coolermaster.com"] },
  thermaltake: { name: "Thermaltake", domains: ["thermaltake.com"] },
  nzxt: { name: "NZXT", domains: ["nzxt.com"] },
  westerndigital: { name: "Western Digital", domains: ["westerndigital.com", "wd.com"], aliases: ["wd"] },
  seagate: { name: "Seagate", domains: ["seagate.com"] },
  sandisk: { name: "SanDisk", domains: ["sandisk.com", "westerndigital.com"] },
  lenovo: { name: "Lenovo", domains: ["lenovo.com"] },
  hp: { name: "HP", domains: ["hp.com"], aliases: ["hewlettpackard"] },
  dell: { name: "Dell", domains: ["dell.com"] },
  acer: { name: "Acer", domains: ["acer.com"] },
  apple: { name: "Apple", domains: ["apple.com"] },
  sony: { name: "Sony", domains: ["sony.com", "sony.net"] },
  lg: { name: "LG", domains: ["lg.com"], aliases: ["lgelectronics"] },
  philips: { name: "Philips", domains: ["philips.com"] },
  // Semiconductores y componentes
  texasinstruments: { name: "Texas Instruments", domains: ["ti.com"], aliases: ["ti"] },
  stmicroelectronics: { name: "STMicroelectronics", domains: ["st.com"], aliases: ["st"] },
  nxp: { name: "NXP", domains: ["nxp.com"], aliases: ["nxpsemiconductors"] },
  infineon: { name: "Infineon", domains: ["infineon.com"], aliases: ["infineontechnologies"] },
  onsemi: { name: "onsemi", domains: ["onsemi.com"], aliases: ["onsemiconductor"] },
  microchip: { name: "Microchip", domains: ["microchip.com"], aliases: ["microchiptechnology", "atmel"] },
  analogdevices: {
    name: "Analog Devices",
    domains: ["analog.com"],
    aliases: ["adi", "lineartechnology", "maxim", "maximintegrated"],
  },
  renesas: { name: "Renesas", domains: ["renesas.com"] },
  rohm: { name: "ROHM", domains: ["rohm.com"] },
  vishay: { name: "Vishay", domains: ["vishay.com"] },
  nexperia: { name: "Nexperia", domains: ["nexperia.com"] },
  diodes: { name: "Diodes Incorporated", domains: ["diodes.com"], aliases: ["diodesincorporated"] },
  murata: { name: "Murata", domains: ["murata.com"] },
  tdk: { name: "TDK", domains: ["tdk.com"], aliases: ["epcos"] },
  kemet: { name: "KEMET", domains: ["kemet.com"] },
  nichicon: { name: "Nichicon", domains: ["nichicon.co.jp"] },
  rubycon: { name: "Rubycon", domains: ["rubycon.co.jp"] },
  panasonic: { name: "Panasonic", domains: ["panasonic.com"] },
  yageo: { name: "Yageo", domains: ["yageo.com"] },
  bourns: { name: "Bourns", domains: ["bourns.com"] },
  littelfuse: { name: "Littelfuse", domains: ["littelfuse.com"] },
  molex: { name: "Molex", domains: ["molex.com"] },
  teconnectivity: { name: "TE Connectivity", domains: ["te.com"], aliases: ["te"] },
  amphenol: { name: "Amphenol", domains: ["amphenol.com"] },
  broadcom: { name: "Broadcom", domains: ["broadcom.com"] },
  qualcomm: { name: "Qualcomm", domains: ["qualcomm.com"] },
  mediatek: { name: "MediaTek", domains: ["mediatek.com"] },
  realtek: { name: "Realtek", domains: ["realtek.com"] },
  silabs: { name: "Silicon Labs", domains: ["silabs.com"], aliases: ["siliconlabs", "siliconlaboratories"] },
  espressif: { name: "Espressif", domains: ["espressif.com"], aliases: ["espressifsystems"] },
  raspberrypi: { name: "Raspberry Pi", domains: ["raspberrypi.com"] },
  arduino: { name: "Arduino", domains: ["arduino.cc"] },
  winbond: { name: "Winbond", domains: ["winbond.com"] },
  macronix: { name: "Macronix", domains: ["macronix.com"] },
  monolithicpower: { name: "Monolithic Power Systems", domains: ["monolithicpower.com"], aliases: ["mps"] },
  richtek: { name: "Richtek", domains: ["richtek.com"] },
};

export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const BY_KEY = new Map<string, (typeof REGISTRY)[string]>();
for (const [key, entry] of Object.entries(REGISTRY)) {
  BY_KEY.set(key, entry);
  for (const alias of entry.aliases ?? []) BY_KEY.set(alias, entry);
}

export function officialManufacturer(manufacturer: string | null | undefined) {
  if (!manufacturer) return undefined;
  return BY_KEY.get(normalizeName(manufacturer));
}

export function isOfficialUrl(url: string, domains: string[]) {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}
