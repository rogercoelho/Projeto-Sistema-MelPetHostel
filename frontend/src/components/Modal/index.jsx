import "./styles.css";

function Modal({
  isOpen,
  onClose,
  title,
  children,
  containerStyle,
  contentStyle,
  hideHeader = false,
  closeOnBackdropClick = true,
  ...rest
}) {
  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} {...rest}>
      <div
        className="modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={containerStyle}
      >
        {!hideHeader && (
          <div className="modal-header">
            <h2 id="modal-title">{title}</h2>
            <button type="button" className="modal-close" onClick={onClose}>
              ×
            </button>
          </div>
        )}
        <div className="modal-content" style={contentStyle}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default Modal;
