import { useState } from "react";
import { CITY_PHOTOS, ROOM_PHOTOS } from "../photos";

const ALL_ROOM_PHOTOS = [...new Map(Object.values(ROOM_PHOTOS).flat().map((p) => [p.file, p])).values()];

export const cityPhoto = (city, n = 0) => {
  const list = CITY_PHOTOS[city];
  return list ? list[n % list.length] : null;
};
export const roomPhoto = (type, n = 0) => {
  const list = ROOM_PHOTOS[type];
  return list ? list[n % list.length] : null;
};
// Each hotel gets its own example room photo, so cards in a row look different.
export const hotelPhoto = (hotel) => ALL_ROOM_PHOTOS[(hotel?.id ?? 0) % ALL_ROOM_PHOTOS.length];

const url = (photo, width) => photo.src.replace("{w}", width);

/** A Commons photo with a small label. Shows `fallback` (the drawn art) if it can't load. */
export default function Photo({ photo, alt, label, width = 960, sizes = "100vw", className = "", fallback = null }) {
  const [failed, setFailed] = useState(false);
  if (!photo || failed) return fallback;
  return (
    <span className={`photo ${className}`}>
      <img
        src={url(photo, width)}
        srcSet={`${url(photo, 500)} 500w, ${url(photo, 960)} 960w, ${url(photo, 1280)} 1280w`}
        sizes={sizes}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      {label && <span className="photo-label">{label}</span>}
    </span>
  );
}
