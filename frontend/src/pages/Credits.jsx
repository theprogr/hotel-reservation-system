import { Link } from "react-router-dom";
import { label } from "../api";
import { CITY_PHOTOS, ROOM_PHOTOS } from "../photos";

function CreditList({ groups }) {
  return (
    <div className="credit-grid">
      {groups.map(([group, photo]) => (
        <figure key={photo.file + group} className="credit">
          <img src={photo.src.replace("{w}", "500")} alt="" loading="lazy" />
          <figcaption>
            <strong>{group}</strong>
            <span>
              <a href={photo.page}>{photo.file}</a> by {photo.author},{" "}
              {photo.licenseUrl ? <a href={photo.licenseUrl}>{photo.license}</a> : photo.license}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function Credits() {
  const cities = Object.entries(CITY_PHOTOS).flatMap(([city, list]) => list.map((p) => [city, p]));
  const seen = new Set();
  const rooms = Object.entries(ROOM_PHOTOS)
    .flatMap(([type, list]) => list.map((p) => [`${label(type)} room example`, p]))
    .filter(([, p]) => !seen.has(p.file) && seen.add(p.file));

  return (
    <div className="wrap page-body">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span aria-hidden="true">›</span><span>Photo credits</span>
      </nav>
      <h1 className="credits-title">Photo credits</h1>
      <p className="muted credits-intro">
        All photos come from <a href="https://commons.wikimedia.org">Wikimedia Commons</a> and are used, unchanged,
        under the license shown. City photos show the real city. The hotels on this site are sample data, so room
        photos are examples from other hotels, not photos of the hotel listed.
      </p>
      <section>
        <h2>Cities</h2>
        <CreditList groups={cities} />
      </section>
      <section>
        <h2>Example rooms</h2>
        <CreditList groups={rooms} />
      </section>
    </div>
  );
}
