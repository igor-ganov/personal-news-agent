import { html } from "lit";

/**
 * A yellow hexagonal HB pencil lying across the page, drawn to read as a real
 * object: sharpened wood cone, graphite tip, paint ending in scallops at the cut,
 * three lit facets, a ribbed ferrule and a worn eraser, with a tight contact
 * shadow and a soft cast shadow from a light at the top left.
 *
 * Ids live in the caller's shadow root, so two pencils on a page never clash.
 */
export const pencilSvg = html`
  <svg data-object="pencil" aria-hidden="true" viewBox="-6 -8 238 44" class="pencil">
    <defs>
      <linearGradient id="pcBody" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="20">
        <stop offset="0" stop-color="#fde684"></stop><stop offset="0.3" stop-color="#f8cc3a"></stop>
        <stop offset="0.325" stop-color="#fff2b8"></stop><stop offset="0.345" stop-color="#f3bd24"></stop>
        <stop offset="0.64" stop-color="#e7a710"></stop><stop offset="0.665" stop-color="#b97b00"></stop>
        <stop offset="1" stop-color="#8a5a00"></stop>
      </linearGradient>
      <linearGradient id="pcWood" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="20">
        <stop offset="0" stop-color="#f1d8b0"></stop><stop offset="0.5" stop-color="#dcb688"></stop>
        <stop offset="1" stop-color="#b48855"></stop>
      </linearGradient>
      <linearGradient id="pcLead" gradientUnits="userSpaceOnUse" x1="0" y1="7.5" x2="0" y2="12.5">
        <stop offset="0" stop-color="#808080"></stop><stop offset="0.45" stop-color="#3a3a3a"></stop>
        <stop offset="1" stop-color="#1c1c1c"></stop>
      </linearGradient>
      <linearGradient id="pcFerrule" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="20">
        <stop offset="0" stop-color="#858b92"></stop><stop offset="0.18" stop-color="#e9ecee"></stop>
        <stop offset="0.3" stop-color="#fbfcfc"></stop><stop offset="0.46" stop-color="#b3b9bf"></stop>
        <stop offset="0.72" stop-color="#737a81"></stop><stop offset="0.9" stop-color="#5a6067"></stop>
        <stop offset="1" stop-color="#6d737a"></stop>
      </linearGradient>
      <linearGradient id="pcEraser" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="20">
        <stop offset="0" stop-color="#f6b0aa"></stop><stop offset="0.3" stop-color="#ec9692"></stop>
        <stop offset="0.72" stop-color="#d47574"></stop><stop offset="1" stop-color="#a45253"></stop>
      </linearGradient>
      <filter id="pcSoft" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="2.6"></feGaussianBlur></filter>
      <filter id="pcTight" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="0.7"></feGaussianBlur></filter>
      <clipPath id="pcBodyClip">
        <path d="M33 0 L187 0 L187 20 L33 20 Q 37.5 16.7 33.5 13.3 Q 38 10 33.5 6.7 Q 37.5 3.3 33 0 Z"></path>
      </clipPath>
    </defs>
    <path class="cast" d="M0 10 L34 0 L215 0 Q 220 0 220 5 L220 15 Q 220 20 215 20 L34 20 Z" transform="translate(4 7)" filter="url(#pcSoft)"></path>
    <path class="contact" d="M0 10 L34 0 L215 0 Q 220 0 220 5 L220 15 Q 220 20 215 20 L34 20 Z" transform="translate(1 2.2)" filter="url(#pcTight)"></path>
    <path d="M8.5 7.6 L36 0 L36 20 L8.5 12.4 Z" fill="url(#pcWood)"></path>
    <path d="M13 8.9 L36 4.6 M13 11.2 L36 15.6 M20 9.9 L36 9.6" fill="none" stroke="rgba(140, 95, 50, 0.32)" stroke-width="0.6"></path>
    <path d="M0 10 L8.8 7.5 L8.8 12.5 Z" fill="url(#pcLead)"></path>
    <path d="M1.3 9.6 L8.5 7.9" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="0.5"></path>
    <g clip-path="url(#pcBodyClip)">
      <rect x="30" y="0" width="158" height="20" fill="url(#pcBody)"></rect>
      <path d="M30 6.6 L188 6.6" stroke="rgba(255, 246, 205, 0.6)" stroke-width="0.5"></path>
      <path d="M30 13.3 L188 13.3" stroke="rgba(110, 70, 0, 0.35)" stroke-width="0.5"></path>
      <rect x="40" y="2" width="146" height="1.2" fill="rgba(255, 255, 255, 0.5)"></rect>
      <text x="62" y="12.3" class="stamp">SKILL GROWER · HB</text>
    </g>
    <rect x="187" y="-0.3" width="21" height="20.6" fill="url(#pcFerrule)"></rect>
    <rect x="194" y="-0.3" width="5" height="20.6" fill="rgba(40, 45, 50, 0.13)"></rect>
    <path d="M189.5 0 V20 M191.5 0 V20 M203.5 0 V20 M205.5 0 V20" stroke="rgba(60, 65, 70, 0.45)" stroke-width="0.6"></path>
    <path d="M190.3 0 V20 M204.3 0 V20" stroke="rgba(255, 255, 255, 0.55)" stroke-width="0.4"></path>
    <path d="M208 0.6 L215 0.6 Q 220 0.6 220 5 L220 15 Q 220 19.4 215 19.4 L208 19.4 Z" fill="url(#pcEraser)"></path>
    <path d="M216 1.2 Q 219.6 1.6 219.6 5 L219.6 15 Q 219.6 18.4 216 18.8" fill="none" stroke="rgba(120, 50, 50, 0.25)" stroke-width="1.2"></path>
  </svg>
`;
