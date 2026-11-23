// Illustrations drawn in code, so every hotel and city has its own picture without photos.

// Small seeded random generator: the same hotel always gets the same picture.
function random(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const SKIES = {
  Almaty: ["#ffcf8b", "#f0806a", "#5c4a8a"],
  Astana: ["#cfe7ff", "#7fb2e8", "#2d5aa0"],
  Shymkent: ["#ffe3a3", "#f6a65a", "#b4553a"],
  Aktau: ["#d6f3f5", "#7cc9d6", "#21788c"],
  Atyrau: ["#f9e1c8", "#e7a17a", "#7d4d6e"],
  Karaganda: ["#e7e1f7", "#a79ad6", "#4b4386"],
  Turkistan: ["#fff0c9", "#f2c063", "#c27a2c"],
  Taraz: ["#fde2d2", "#ee9f86", "#8a4b5c"],
  Pavlodar: ["#dff1ea", "#8ccab0", "#2f6e6a"],
  Kostanay: ["#e9eef8", "#9fb3dc", "#3e5591"],
};
const FALLBACK_SKY = ["#e8eef3", "#a9c1d1", "#43627a"];
const FACADES = ["#f3ede4", "#e9dccb", "#dfe6ea", "#efe2d6", "#e3e0ec", "#f1e6cf"];

// Each city's skyline, drawn behind the hotel.
function Landmark({ city, color }) {
  switch (city) {
    case "Almaty":
      return <path d="M0 150 L60 70 L95 110 L150 40 L210 120 L250 80 L320 150 Z" fill={color} />;
    case "Astana":
      return (
        <g fill={color}>
          <rect x="228" y="70" width="6" height="80" />
          <circle cx="231" cy="62" r="13" />
          <rect x="40" y="100" width="26" height="50" />
          <path d="M80 150 L95 80 L110 150 Z" />
          <rect x="270" y="95" width="30" height="55" />
        </g>
      );
    case "Aktau":
      return <path d="M0 132 Q40 124 80 132 T160 132 T240 132 T320 132 V150 H0 Z" fill={color} />;
    case "Turkistan":
      return (
        <g fill={color}>
          <path d="M210 150 V105 Q240 60 270 105 V150 Z" />
          <rect x="196" y="110" width="12" height="40" />
          <rect x="272" y="110" width="12" height="40" />
        </g>
      );
    default:
      return (
        <g fill={color}>
          <rect x="20" y="105" width="30" height="45" />
          <rect x="55" y="88" width="22" height="62" />
          <rect x="250" y="96" width="28" height="54" />
          <rect x="282" y="112" width="26" height="38" />
        </g>
      );
  }
}

export function HotelArt({ hotel, variant = "exterior", className = "" }) {
  const id = hotel?.id ?? 1;
  const rand = random(id * 31 + (variant === "exterior" ? 0 : variant === "room" ? 7 : 13));
  const [light, mid, dark] = SKIES[hotel?.city] || FALLBACK_SKY;
  const stars = hotel?.stars ?? 3;
  const label = `Illustration of ${hotel?.name || "a hotel"}`;

  if (variant === "room") {
    const blanket = ["#d9776b", "#5e8f88", "#c49a4a", "#6c7bb8", "#a46a8f"][id % 5];
    return (
      <svg className={`art ${className}`} viewBox="0 0 320 200" role="img" aria-label={`Illustration of a room at ${hotel?.name || "the hotel"}`} preserveAspectRatio="xMidYMid slice">
        <rect width="320" height="200" fill={light} />
        <rect y="140" width="320" height="60" fill="#c9b49a" />
        <rect x="200" y="30" width="80" height="70" rx="3" fill={mid} stroke="#fff" strokeWidth="5" />
        <path d="M205 95 L235 60 L255 80 L275 55 V95 Z" fill={dark} opacity="0.6" />
        <rect x="40" y="80" width="130" height="16" rx="6" fill="#7a5b40" />
        <rect x="40" y="96" width="130" height="50" rx="4" fill="#fff" />
        <rect x="40" y="112" width="130" height="34" rx="4" fill={blanket} />
        <rect x="52" y="90" width="40" height="16" rx="7" fill="#f4efe6" />
        <rect x="100" y="90" width="40" height="16" rx="7" fill="#f4efe6" />
        <rect x="180" y="118" width="22" height="28" fill="#8a6a4d" />
        <circle cx="191" cy="108" r="9" fill="#f2c45a" opacity="0.9" />
      </svg>
    );
  }

  const facade = FACADES[(id * 7) % FACADES.length];
  const roof = ["#3d4f63", "#7a3b2e", "#2f5d50", "#5a4a7a", "#8a6a2f"][(id * 3) % 5];
  const floors = stars + 2;
  const width = 90 + stars * 14;
  const left = 160 - width / 2 + (((id * 37) % 60) - 30);
  const floorHeight = 15;
  const top = 168 - floors * floorHeight;
  const cols = Math.round(width / 22);
  const windows = [];
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      windows.push(
        <rect
          key={`${f}-${c}`}
          x={left + 8 + c * ((width - 16) / cols)}
          y={top + 6 + f * floorHeight}
          width={(width - 16) / cols - 5}
          height={8}
          rx="1"
          fill={rand() > 0.45 ? "#ffd977" : "#6f8796"}
        />,
      );
    }
  }

  return (
    <svg className={`art ${className}`} viewBox="0 0 320 200" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`sky-${id}-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={mid} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#sky-${id}-${variant})`} />
      <circle cx={60 + (id % 5) * 45} cy="38" r="16" fill="#fff6dc" opacity="0.85" />
      <g opacity="0.55">
        <Landmark city={hotel?.city} color={dark} />
      </g>
      <rect y="168" width="320" height="32" fill={dark} opacity="0.85" />
      {id % 2 === 0 && (
        <rect x={left > 160 ? left - 70 : left + width + 12} y={130} width={56} height={38} fill={dark} opacity="0.35" />
      )}
      <rect x={left} y={top} width={width} height={floors * floorHeight + 2} fill={facade} />
      <rect x={left - 6} y={top - 8} width={width + 12} height="9" fill={roof} />
      {windows}
      <rect x={left + width / 2 - 6} y={156} width={12} height={12} fill={roof} />
      <rect x={left + width / 2 - 34} y={top - 24} width={68} height={14} rx="3" fill="#fff" />
      <text x={left + width / 2} y={top - 13.5} textAnchor="middle" fontSize="9" fontWeight="700" fill={roof} fontFamily="Inter, sans-serif">
        {"★".repeat(stars)}
      </text>
      <circle cx={left - 18} cy="160" r="12" fill="#4f7d5b" />
      <rect x={left - 19.5} y="160" width="3" height="10" fill="#5b4632" />
      <circle cx={left + width + 18} cy="158" r="14" fill="#4f7d5b" />
      <rect x={left + width + 16.5} y="158" width="3" height="12" fill="#5b4632" />
    </svg>
  );
}

export function CityArt({ city, className = "" }) {
  const [light, mid, dark] = SKIES[city] || FALLBACK_SKY;
  const seed = [...city].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return (
    <svg className={`art ${className}`} viewBox="0 0 320 200" role="img" aria-label={`Illustration of ${city}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`city-${city}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={mid} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#city-${city})`} />
      <circle cx={70 + (seed % 180)} cy="50" r="20" fill="#fff6dc" opacity="0.9" />
      <g transform="translate(0 30)" opacity="0.9">
        <Landmark city={city} color={dark} />
      </g>
      <rect y="180" width="320" height="20" fill={dark} />
    </svg>
  );
}
