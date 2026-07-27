import "./styles.css";

function Button({
  children,
  onClick,
  variant = "primary",
  size = "",
  fullWidth = false,
  type = "button",
  disabled = false,
  className = "",
  ...rest
}) {
  const classes = [
    "btn",
    `btn-${variant}`,
    size && `btn-${size}`,
    fullWidth && "btn-full",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Button;
