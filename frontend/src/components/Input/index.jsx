import { useState } from "react";
import "./styles.css";

function EyeIcon({ open }) {
  if (open) {
    // Visible (eye) - cleaner Heroicons-like outline
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-.03.103-.061.206-.094.307C20.263 15.057 16.472 18 12 18c-4.478 0-8.268-2.943-9.542-7 .033-.101.064-.204.094-.307z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 15a3 3 0 100-6 3 3 0 000 6z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // Hidden (eye-off) - cleaner Heroicons-like outline
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.94 10.94A3 3 0 0113.06 13.06"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.34 6.34C4.95 7.39 3.86 8.7 3 10c1.274 4.057 5.065 7 9.542 7 1.51 0 2.91-.33 4.12-.88"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.88 5.88C11.09 5.33 12.49 5 14 5c4.478 0 8.268 2.943 9.542 7-.332 1.117-.9 2.206-1.67 3.17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Input({
  label,
  type = "text",
  name,
  value,
  onChange,
  placeholder = "",
  required = false,
  disabled = false,
  className = "",
  ...rest
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (show ? "text" : "password") : type;

  return (
    <div className={`input-group ${className}`}>
      {label && <label htmlFor={name}>{label}</label>}
      <div className={`input-with-toggle ${isPassword ? "has-toggle" : ""}`}>
        <input
          type={inputType}
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            className={`eye-toggle ${show ? "open" : ""}`}
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={show}
            onClick={() => setShow((s) => !s)}
            tabIndex={0}
          >
            <EyeIcon open={show} />
          </button>
        )}
      </div>
    </div>
  );
}

export default Input;
