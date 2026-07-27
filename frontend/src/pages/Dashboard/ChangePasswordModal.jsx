import { useEffect, useState } from "react";
import { Alert, Button, Input, Modal } from "../../components";

export default function ChangePasswordModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  description,
  currentLabel = "Senha atual",
  closeOnBackdropClick = true,
}) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
      setMessage("");
      setMessageType("error");
    }
  }, [isOpen]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (novaSenha !== confirmarSenha) {
      setMessage("As senhas nao coincidem");
      setMessageType("error");
      return;
    }

    if (novaSenha.length < 6) {
      setMessage("A nova senha deve ter pelo menos 6 caracteres");
      setMessageType("error");
      return;
    }

    setLoading(true);
    try {
      await onSubmit({ senhaAtual, novaSenha, confirmarSenha });
      setMessage("Senha alterada com sucesso");
      setMessageType("success");
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (error) {
      setMessage(error.message || "Erro ao alterar senha");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      closeOnBackdropClick={closeOnBackdropClick}
    >
      <form className="form-senha" onSubmit={handleSubmit}>
        {description ? <p>{description}</p> : null}

        <Input
          label={currentLabel}
          type="password"
          name="senhaAtual"
          value={senhaAtual}
          onChange={(event) => setSenhaAtual(event.target.value)}
          placeholder="Digite sua senha atual"
          required
        />
        <Input
          label="Nova senha"
          type="password"
          name="novaSenha"
          value={novaSenha}
          onChange={(event) => setNovaSenha(event.target.value)}
          placeholder="Digite a nova senha"
          required
        />
        <Input
          label="Confirmar nova senha"
          type="password"
          name="confirmarSenha"
          value={confirmarSenha}
          onChange={(event) => setConfirmarSenha(event.target.value)}
          placeholder="Confirme a nova senha"
          required
        />

        {message ? <Alert type={messageType}>{message}</Alert> : null}

        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Alterando..." : "Alterar senha"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
