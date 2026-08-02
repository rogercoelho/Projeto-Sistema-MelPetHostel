function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function getItemTitle(item) {
  return item.title || item.label || "";
}

function getItemSummary(item) {
  return item.summary || item.description || "";
}

function renderItem(item) {
  if (typeof item === "string") {
    return <MenuItem key={item} title={item} />;
  }

  return (
    <MenuItem
      className={item.className}
      contentClassName={item.contentClassName}
      disabled={item.disabled}
      isOpen={item.isOpen}
      key={item.id || item.key || getItemTitle(item)}
      leadingAction={item.leadingAction}
      onAction={item.onAction}
      summary={getItemSummary(item)}
      title={getItemTitle(item)}
    >
      {item.content}
    </MenuItem>
  );
}

function renderPanel(panel) {
  return (
    <MenuPanel
      className={panel.className}
      key={panel.id || panel.title || panel.ariaLabel}
      summary={panel.summary}
      title={panel.title}
    >
      {panel.before}
      {panel.items?.length ? (
        <MenuList
          ariaLabel={panel.ariaLabel || panel.title}
          className={panel.listClassName}
        >
          {panel.items.map(renderItem)}
        </MenuList>
      ) : null}
      {panel.children}
      {panel.after}
    </MenuPanel>
  );
}

export function MenuTemplate({ children, className = "", panels = [] }) {
  return (
    <main className={cx("menu-template", className)}>
      {panels.map(renderPanel)}
      {children}
    </main>
  );
}

export function MenuPanel({ children, className = "", summary, title }) {
  return (
    <section className={cx("menu-template-panel", className)}>
      {title || summary ? (
        <header className="menu-template-header">
          {title ? <h2>{title}</h2> : null}
          {summary ? <p>{summary}</p> : null}
        </header>
      ) : null}
      <div className="menu-template-body">{children}</div>
    </section>
  );
}

export function MenuList({ ariaLabel, children, className = "" }) {
  return (
    <div className={cx("menu-template-list", className)} aria-label={ariaLabel}>
      {children}
    </div>
  );
}

export function MenuItem({
  children,
  className = "",
  contentClassName = "",
  disabled = false,
  isOpen = false,
  leadingAction,
  onAction,
  summary,
  title,
}) {
  const hasContent = children !== undefined && children !== null;
  const isInteractive = Boolean(onAction);
  const itemContent = (
    <>
      <strong>{title}</strong>
      {summary ? <span>{summary}</span> : null}
    </>
  );

  return (
    <section className={cx("menu-template-item", isOpen && "is-open", className)}>
      <div className={cx(leadingAction && "menu-template-item-row")}>
        {leadingAction ? (
          <div className="menu-template-item-leading">{leadingAction}</div>
        ) : null}

        {isInteractive ? (
          <button
            className="menu-template-item-button"
            type="button"
            aria-expanded={hasContent ? isOpen : undefined}
            disabled={disabled}
            onClick={onAction}
          >
            {itemContent}
          </button>
        ) : (
          <div className="menu-template-item-button">{itemContent}</div>
        )}
      </div>

      {isOpen && hasContent ? (
        <div className={cx("menu-template-item-content", contentClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
