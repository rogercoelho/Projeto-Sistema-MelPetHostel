import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Button, Input, Alert } from "../../components";
import "./styles.css";

function Login() {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const { login: fazerLogin } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      const resultado = await fazerLogin(login, senha);
      if (!resultado.sucesso) {
        setErro(resultado.mensagem || "Erro ao fazer login");
      }
    } catch {
      setErro("Erro ao conectar com o servidor");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="login-container">
      <div className="panel login-card">
        <div className="login-header">
          <h1>🐾 Sistema Mel Pet Hostel</h1>
          <p> Mais que um hotel: Um lar de amor para seu pet </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <Input
            label="Usuário"
            name="login"
            autoFocus
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Digite seu usuário"
            required
            autoComplete="username"
          />

          <Input
            label="Senha"
            type="password"
            name="senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Digite sua senha"
            required
            autoComplete="current-password"
          />

          {erro && <Alert type="error">{erro}</Alert>}

          <Button type="submit" disabled={carregando}>
            {carregando ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default Login;
