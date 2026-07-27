import { Button } from "../../components";

function AdminPageShell({ title, description, onBack, children }) {
  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <span>Administracao</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Button type="button" variant="outline" onClick={onBack}>
          Voltar
        </Button>
      </header>

      {children}
    </main>
  );
}

export default AdminPageShell;

