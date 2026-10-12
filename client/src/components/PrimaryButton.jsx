export default function PrimaryButton({ children, loading = false, ...props }) {
  return (
    <button className="btn" disabled={loading || props.disabled} {...props}>
      {loading ? 'Memeriksa…' : children}
    </button>
  );
}