import { useTranslation } from "react-i18next";
interface PlaceholderTableProps {
  title: string;
  description: string;
  columns: string[];
}

export function PlaceholderTable({ title, description, columns }: PlaceholderTableProps) {
  const {t} = useTranslation("common");
  return (
    <section>
      <header className="page-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length}>{t("empty")}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
