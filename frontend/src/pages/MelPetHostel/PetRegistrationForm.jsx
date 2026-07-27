import { useState } from "react";
import { Alert, Button } from "../../components";
import {
  PET_ANAMNESIS_SECTIONS,
  findMissingRequiredField,
  getEmptyPetAnamnesisForm,
} from "./petAnamnesisForm";

function fieldClassName(field) {
  return ["pet-form-field", field.wide ? "pet-form-field--wide" : ""]
    .filter(Boolean)
    .join(" ");
}

function optionId(fieldName, option, index) {
  return `${fieldName}-${index}-${String(option)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()}`;
}

function FieldLabel({ field, htmlFor }) {
  return (
    <label className="pet-form-label" htmlFor={htmlFor}>
      {field.label}
      {field.required ? <span aria-hidden="true"> *</span> : null}
    </label>
  );
}

function TextField({ field, value, onChange }) {
  const fieldId = `pet-${field.name}`;

  if (field.type === "textarea") {
    return (
      <div className={fieldClassName(field)}>
        <FieldLabel field={field} htmlFor={fieldId} />
        <textarea
          id={fieldId}
          name={field.name}
          value={value || ""}
          rows={field.rows || 3}
          placeholder={field.placeholder}
          required={field.required}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
      </div>
    );
  }

  return (
    <div className={fieldClassName(field)}>
      <FieldLabel field={field} htmlFor={fieldId} />
      <input
        id={fieldId}
        name={field.name}
        type={field.type || "text"}
        value={value || ""}
        placeholder={field.placeholder}
        required={field.required}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    </div>
  );
}

function ChoiceField({ field, value, onChange, onToggleOption }) {
  const selectedValues = Array.isArray(value) ? value : [];
  const isCheckboxGroup = field.type === "checkboxGroup";

  return (
    <div className={`${fieldClassName(field)} pet-form-field--choices`}>
      <span className="pet-form-label">
        {field.label}
        {field.required ? <span aria-hidden="true"> *</span> : null}
      </span>
      <div className="pet-choice-grid" role="group" aria-label={field.label}>
        {field.options.map((option, index) => {
          const id = optionId(field.name, option, index);
          const checked = isCheckboxGroup
            ? selectedValues.includes(option)
            : value === option;

          return (
            <label
              key={option}
              className={`pet-choice ${checked ? "is-selected" : ""}`}
              htmlFor={id}
            >
              <input
                id={id}
                type={isCheckboxGroup ? "checkbox" : "radio"}
                name={field.name}
                value={option}
                checked={checked}
                onChange={() => {
                  if (isCheckboxGroup) {
                    onToggleOption(field.name, option);
                    return;
                  }

                  onChange(field.name, option);
                }}
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmationField({ field, value, onChange }) {
  return (
    <div className={`${fieldClassName(field)} pet-form-field--confirmation`}>
      <label className={`pet-confirmation ${value ? "is-selected" : ""}`}>
        <input
          type="checkbox"
          name={field.name}
          checked={Boolean(value)}
          onChange={(event) => onChange(field.name, event.target.checked)}
        />
        <span>
          {field.label}
          {field.required ? <strong aria-hidden="true"> *</strong> : null}
        </span>
      </label>
    </div>
  );
}

function PetFormField({ field, value, onChange, onToggleOption }) {
  if (field.type === "radio" || field.type === "checkboxGroup") {
    return (
      <ChoiceField
        field={field}
        value={value}
        onChange={onChange}
        onToggleOption={onToggleOption}
      />
    );
  }

  if (field.type === "checkbox") {
    return (
      <ConfirmationField field={field} value={value} onChange={onChange} />
    );
  }

  return <TextField field={field} value={value} onChange={onChange} />;
}

export default function PetRegistrationForm({ onSubmit }) {
  const [formData, setFormData] = useState(getEmptyPetAnamnesisForm);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function updateField(name, value) {
    setFormData((current) => ({ ...current, [name]: value }));
    setErrorMessage("");
  }

  function resetForm() {
    setFormData(getEmptyPetAnamnesisForm());
    setErrorMessage("");
  }

  function toggleCheckboxGroupOption(name, option) {
    setFormData((current) => {
      const selected = new Set(current[name] || []);

      if (selected.has(option)) {
        selected.delete(option);
      } else {
        selected.add(option);
      }

      return { ...current, [name]: Array.from(selected) };
    });
    setErrorMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const missingField = findMissingRequiredField(formData);
    if (missingField) {
      setErrorMessage(`Preencha o campo obrigatório: ${missingField}`);
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        ...formData,
        cadastradoEm: new Date().toISOString(),
      });
      resetForm();
    } catch (error) {
      setErrorMessage(error?.message || "Não foi possível cadastrar o pet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="pet-registration-form" onSubmit={handleSubmit} noValidate>
      <div className="pet-form-body">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}

        {PET_ANAMNESIS_SECTIONS.map((section) => (
          <fieldset className="pet-form-section" key={section.number}>
            <legend>
              <span>{section.number}</span>
              {section.title}
            </legend>
            <p>{section.description}</p>

            <div className="pet-form-grid">
              {section.fields.map((field) => (
                <PetFormField
                  key={field.name}
                  field={field}
                  value={formData[field.name]}
                  onChange={updateField}
                  onToggleOption={toggleCheckboxGroupOption}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="pet-form-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={resetForm}
          disabled={saving}
        >
          Limpar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Salvar ficha"}
        </Button>
      </div>
    </form>
  );
}
