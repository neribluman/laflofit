export default function PinInput({
  label = "Your 4-digit PIN",
  autoFocus = false,
}: {
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor="pin">
        {label}
      </label>
      <input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="\d{4}"
        maxLength={4}
        required
        autoFocus={autoFocus}
        placeholder="••••"
        className="field nums text-center text-2xl tracking-[0.6em]"
      />
    </div>
  );
}
