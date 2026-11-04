import AdminNavigation from "@/components/AdminNavigation";
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="adminWorkspace">
      <AdminNavigation />
      <div className="adminSectionContent">{children}</div>
    </div>
  );
}
