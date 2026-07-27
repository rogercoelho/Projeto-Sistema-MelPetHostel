import "./styles.css";

function Card({ children, className = "", title = "", ...rest }) {
  return (
    <div className={`card ${className}`} role="region" {...rest}>
      {title && <h2 className="card-title">{title}</h2>}
      {children}
    </div>
  );
}

export default Card;
