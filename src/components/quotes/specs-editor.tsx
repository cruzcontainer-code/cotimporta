"use client";

import { useState } from "react";
import { useCopy } from "@/components/quotes/wizard-kit";

// Editor de la ficha técnica. Las secciones anidadas (grupos, auxiliares) se editan como filas
// planas y se reagrupan al guardar, para que sea una sola tabla por sección.

type Row = { label: string; value: string };
export type Specs = {
  productName: string;
  summary: string;
  equipment: { name: string; quantity: number }[];
  specGroups: { title: string; rows: Row[] }[];
  components: { component: string; brand: string; origin: string; note: string }[];
  auxiliaries: { name: string; model: string; rows: Row[] }[];
  warranty: { title: string; text: string }[];
};
export const EMPTY_SPECS: Specs = {
  productName: "",
  summary: "",
  equipment: [],
  specGroups: [],
  components: [],
  auxiliaries: [],
  warranty: [],
};

type Flat = Record<string, string>;
type Section = { key: string; columns: string[] };

const SECTIONS: Section[] = [
  { key: "equipment", columns: ["name", "quantity"] },
  { key: "specs", columns: ["group", "label", "value"] },
  { key: "components", columns: ["component", "brand", "origin", "note"] },
  { key: "auxiliaries", columns: ["name", "model", "label", "value"] },
  { key: "warranty", columns: ["title", "text"] },
];

function flatten(specs: Specs): Record<string, Flat[]> {
  return {
    equipment: specs.equipment.map((e) => ({ name: e.name, quantity: String(e.quantity) })),
    specs: specs.specGroups.flatMap((g) => g.rows.map((r) => ({ group: g.title, ...r }))),
    components: specs.components.map((c) => ({ ...c })),
    auxiliaries: specs.auxiliaries.flatMap((a) =>
      a.rows.map((r) => ({ name: a.name, model: a.model, ...r })),
    ),
    warranty: specs.warranty.map((w) => ({ ...w })),
  };
}

/** Reagrupa filas planas por las columnas `by` conservando el orden de aparición. */
function group<T>(rows: Flat[], by: string[], make: (first: Flat, rows: Row[]) => T): T[] {
  const groups = new Map<string, { first: Flat; rows: Row[] }>();
  for (const row of rows) {
    const key = by.map((column) => row[column] ?? "").join("\u0000");
    const entry = groups.get(key) ?? { first: row, rows: [] };
    entry.rows.push({ label: row.label ?? "", value: row.value ?? "" });
    groups.set(key, entry);
  }
  return [...groups.values()].map(({ first, rows: items }) => make(first, items));
}

function unflatten(
  base: { productName: string; summary: string },
  flat: Record<string, Flat[]>,
): Specs {
  const filled = (rows: Flat[] = []) =>
    rows.filter((row) => Object.values(row).some((v) => v.trim() !== ""));
  return {
    ...base,
    equipment: filled(flat.equipment).map((r) => ({
      name: r.name ?? "",
      quantity: Number(r.quantity) || 0,
    })),
    specGroups: group(filled(flat.specs), ["group"], (f, rows) => ({ title: f.group ?? "", rows })),
    components: filled(flat.components).map((r) => ({
      component: r.component ?? "",
      brand: r.brand ?? "",
      origin: r.origin ?? "",
      note: r.note ?? "",
    })),
    auxiliaries: group(filled(flat.auxiliaries), ["name", "model"], (f, rows) => ({
      name: f.name ?? "",
      model: f.model ?? "",
      rows,
    })),
    warranty: filled(flat.warranty).map((r) => ({ title: r.title ?? "", text: r.text ?? "" })),
  };
}

const copy = {
  es: {
    productName: "Nombre del producto",
    summary: "Resumen",
    sections: {
      equipment: "Equipos incluidos",
      specs: "Especificaciones",
      components: "Componentes",
      auxiliaries: "Equipos auxiliares",
      warranty: "Garantía",
    },
    columns: {
      name: "Nombre",
      quantity: "Cantidad",
      group: "Grupo",
      label: "Característica",
      value: "Valor",
      component: "Componente",
      brand: "Marca",
      origin: "Origen",
      note: "Nota",
      model: "Modelo",
      title: "Título",
      text: "Detalle",
    },
    addRow: "Agregar fila",
    save: "Guardar ficha",
  },
  en: {
    productName: "Product name",
    summary: "Summary",
    sections: {
      equipment: "Included equipment",
      specs: "Specifications",
      components: "Components",
      auxiliaries: "Auxiliary equipment",
      warranty: "Warranty",
    },
    columns: {
      name: "Name",
      quantity: "Quantity",
      group: "Group",
      label: "Feature",
      value: "Value",
      component: "Component",
      brand: "Brand",
      origin: "Origin",
      note: "Note",
      model: "Model",
      title: "Title",
      text: "Detail",
    },
    addRow: "Add row",
    save: "Save sheet",
  },
};

type Props = { initial: Specs; pending: boolean; onSave: (specs: Specs) => void };

export function SpecsEditor({ initial, pending, onSave }: Props) {
  const { t } = useCopy(copy);
  const [base, setBase] = useState({ productName: initial.productName, summary: initial.summary });
  const [flat, setFlat] = useState<Record<string, (Flat & { _key: string })[]>>(() =>
    Object.fromEntries(
      Object.entries(flatten(initial)).map(([key, rows]) => [
        key,
        rows.map((row) => ({ ...row, _key: crypto.randomUUID() })),
      ]),
    ),
  );
  const columns = t.columns as Record<string, string>;
  const sections = t.sections as Record<string, string>;

  const update = (section: string, index: number, column: string, value: string) =>
    setFlat({
      ...flat,
      [section]: (flat[section] ?? []).map((row, i) =>
        i === index ? { ...row, [column]: value } : row,
      ),
    });
  const addRow = (section: Section) =>
    setFlat({
      ...flat,
      [section.key]: [
        ...(flat[section.key] ?? []),
        { ...Object.fromEntries(section.columns.map((c) => [c, ""])), _key: crypto.randomUUID() },
      ],
    });
  const removeRow = (section: string, index: number) =>
    setFlat({ ...flat, [section]: (flat[section] ?? []).filter((_, i) => i !== index) });

  function save() {
    const clean = Object.fromEntries(
      Object.entries(flat).map(([key, rows]) => [key, rows.map(({ _key, ...row }) => row as Flat)]),
    );
    onSave(unflatten(base, clean));
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t.productName}</span>
        <input
          className="input"
          value={base.productName}
          onChange={(e) => setBase({ ...base, productName: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t.summary}</span>
        <textarea
          className="input"
          rows={3}
          value={base.summary}
          onChange={(e) => setBase({ ...base, summary: e.target.value })}
        />
      </label>
      {SECTIONS.map((section) => (
        <fieldset key={section.key} className="flex flex-col gap-2">
          <legend className="font-semibold">{sections[section.key]}</legend>
          <div className="overflow-x-auto">
            <table className="table-base text-sm">
              <tbody>
                {(flat[section.key] ?? []).map((row, index) => (
                  <tr key={row._key} className="border-t border-border">
                    {section.columns.map((column) => (
                      <td key={column} className="py-1 pr-2">
                        <input
                          aria-label={`${sections[section.key]}: ${columns[column]} ${index + 1}`}
                          placeholder={columns[column]}
                          className="input"
                          value={row[column] ?? ""}
                          onChange={(e) => update(section.key, index, column, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="py-1">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => removeRow(section.key, index)}
                      >
                        {t.remove}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn-ghost self-start"
            onClick={() => addRow(section)}
          >
            {t.addRow}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn btn-primary self-start"
        disabled={pending}
        onClick={save}
      >
        {t.save}
      </button>
    </div>
  );
}
