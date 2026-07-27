import "./styles.css";

function Alert({ children, type = "info", className = "", ...rest }) {
  const role = type === "error" ? "alert" : "status";
  return (
    <div className={`alert alert-${type} ${className}`} role={role} {...rest}>
      {children}
    </div>
  );
}

export default Alert;
