/**
 * Every Ericahlicious branch, in the order the client lists them.
 *
 * Presentation data for the public site. No branch is special: an order placed
 * here can be picked up at any of them, so nothing in this list is keyed to an
 * order, a stock count or a store. It exists so the footer names all the
 * branches from one place instead of hardcoding an address in the markup.
 */

export type Location = {
  name: string;
  address: string;
  /** Opening hours, written the way the store writes them. */
  hours: string;
  /** Wayfinding line under the address, where there is a useful landmark. */
  landmark?: string;
};

export const LOCATIONS: Location[] = [
  {
    name: "Tikay – Malolos",
    address: "Tikay, Malolos, Bulacan",
    hours: "9:00 AM – 12:00 MN",
  },
  {
    name: "Blas Ople – Malolos",
    address: "Blas Ople Diversion Road, Bulihan, Malolos, Bulacan",
    landmark: "Near La Consolacion University PH",
    hours: "9:00 AM – 11:00 PM",
  },
  {
    name: "Baliwag",
    address: "777 Benigno S. Aquino Avenue, Baliwag, Bulacan",
    hours: "9:00 AM – 12:00 MN",
  },
  {
    name: "Plaridel",
    address: "3727 Cagayan Valley Road, Tabang, Plaridel, Bulacan",
    hours: "9:00 AM – 12:00 MN",
  },
  {
    name: "Valenzuela",
    address: "C&B Circle Mall #25, Maysan Road, Malinta, Valenzuela City",
    hours: "7:00 AM – 9:00 PM",
  },
  {
    name: "Plaza de Cay Pombo – Santa Maria",
    address: "M. Sapa Road, Santa Maria, Bulacan",
    hours: "9:00 AM – 10:00 PM",
  },
];

/** Maps search rather than a pinned place id — no branch has one on file yet. */
export function mapsUrl(location: Location) {
  const query = `Ericahlicious Brew and Bake ${location.address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Store-wide contact details, shown once beside the branch list. */
export const CONTACT = {
  phone: "0969 642 1908",
  phoneHref: "tel:+639696421908",
  facebook: "https://www.facebook.com/ericahliciousbrewandbake",
};
