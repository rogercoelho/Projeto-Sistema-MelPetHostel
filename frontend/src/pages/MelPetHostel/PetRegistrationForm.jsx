import { useEffect, useState } from "react";
import { Button } from "../../components";
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

function TextField({ field, value, onChange, readOnly = false }) {
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
          readOnly={readOnly}
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
        readOnly={readOnly}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    </div>
  );
}

function ChoiceField({
  field,
  value,
  onChange,
  onToggleOption,
  readOnly = false,
}) {
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
                required={field.required && !isCheckboxGroup}
                disabled={readOnly}
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

function ConfirmationField({ field, value, onChange, readOnly = false }) {
  return (
    <div className={`${fieldClassName(field)} pet-form-field--confirmation`}>
      <label className={`pet-confirmation ${value ? "is-selected" : ""}`}>
        <input
          type="checkbox"
          name={field.name}
          checked={Boolean(value)}
          required={field.required}
          disabled={readOnly}
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

function PetFormField({
  field,
  value,
  onChange,
  onToggleOption,
  readOnly = false,
}) {
  if (field.type === "radio" || field.type === "checkboxGroup") {
    return (
      <ChoiceField
        field={field}
        value={value}
        onChange={onChange}
        onToggleOption={onToggleOption}
        readOnly={readOnly}
      />
    );
  }

  if (field.type === "checkbox") {
    return (
      <ConfirmationField
        field={field}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
      />
    );
  }

  return (
    <TextField
      field={field}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
    />
  );
}

export default function PetRegistrationForm({
  initialData = null,
  onSubmit,
  readOnly = false,
}) {
  const [formData, setFormData] = useState(getEmptyPetAnamnesisForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormData({ ...getEmptyPetAnamnesisForm(), ...(initialData || {}) });
  }, [initialData]);

  function clearFieldValidity(name) {
    const field = document.querySelector(`[name="${name}"]`);
    field?.setCustomValidity("");
  }

  function updateField(name, value) {
    clearFieldValidity(name);
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setFormData(getEmptyPetAnamnesisForm());
  }

  function toggleCheckboxGroupOption(name, option) {
    clearFieldValidity(name);
    setFormData((current) => {
      const selected = new Set(current[name] || []);

      if (selected.has(option)) {
        selected.delete(option);
      } else {
        selected.add(option);
      }

      return { ...current, [name]: Array.from(selected) };
    });
  }

  function findMissingCheckboxGroup() {
    for (const section of PET_ANAMNESIS_SECTIONS) {
      for (const field of section.fields) {
        if (!field.required || field.type !== "checkboxGroup") continue;
        if (!formData[field.name]?.length) return field;
      }
    }

    return null;
  }

  function revealInvalidField(field) {
    if (!field) return;

    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.focus({ preventScroll: true });
  }

  function handleInvalid(event) {
    revealInvalidField(event.target);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (readOnly) return;

    const form = event.currentTarget;
    if (!form.checkValidity()) {
      revealInvalidField(form.querySelector(":invalid"));
      return;
    }

    const missingCheckboxGroup = findMissingCheckboxGroup();
    if (missingCheckboxGroup) {
      const target = form.elements[missingCheckboxGroup.name]?.[0];
      target?.setCustomValidity(
        `Preencha o campo obrigatório: ${missingCheckboxGroup.label}`,
      );
      revealInvalidField(target);
      window.setTimeout(() => target?.reportValidity(), 250);
      return;
    }

    const missingField = findMissingRequiredField(formData);
    if (missingField) {
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
      window.alert(error?.message || "Não foi possível cadastrar o pet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="pet-registration-form"
      onSubmit={handleSubmit}
      onInvalidCapture={handleInvalid}
    >
      <div className="pet-form-body">
        {PET_ANAMNESIS_SECTIONS.map((section, sectionIndex) => (
          <fieldset className="pet-form-section" key={section.number}>
            <legend>
              <span>{sectionIndex + 1}</span>
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
                  readOnly={readOnly}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="pet-form-actions">
        {!readOnly ? (
          <Button
            type="button"
            variant="secondary"
            onClick={resetForm}
            disabled={saving}
          >
            Limpar
          </Button>
        ) : null}
        {!readOnly ? (
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar ficha"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
