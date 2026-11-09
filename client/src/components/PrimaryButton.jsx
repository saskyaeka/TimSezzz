export default function PrimaryButton({ children, loading = false, ...props }) {
  return (
    <button className="btn-auth" disabled={loading || props.disabled} {...props}>
      {loading ? 'Memeriksa…' : children}
    </button>
  );
}
