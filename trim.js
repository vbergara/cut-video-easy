/* Selection math is separate so boundary behavior can be tested without a browser. */
(function(root) {
  const MIN = 0.1;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const presetDuration = seconds => Number(seconds) === 15 ? 14.9 : Number(seconds);
  function length(start, requested, duration) {
    const size = clamp(requested, Math.min(MIN, duration), duration);
    const next = clamp(start, 0, duration - size);
    return [next, next + size];
  }
  function move(start, end, delta, duration) {
    const next = clamp(start + delta, 0, duration - (end - start));
    return [next, next + (end - start)];
  }
  function edge(start, end, value, side, duration) {
    const minimum = Math.min(MIN, duration);
    return side === 'start' ? [clamp(value, 0, end - minimum), end] : [start, clamp(value, start + minimum, duration)];
  }
  const api = {MIN, clamp, presetDuration, length, move, edge};
  if (typeof module !== 'undefined') module.exports = api;
  else root.Trim = api;
})(globalThis);
