namespace Umbraco.Community.Messenger;

public sealed class MessengerPresence(TimeProvider clock)
{
    // shortcut: presence is process-local, use distributed presence before running multiple web instances.
    private readonly object _gate = new();
    private readonly Dictionary<string, Connection> _connections = [];
    private sealed record Connection(Guid UserKey, DateTimeOffset Seen, DateTimeOffset LastTyping);
    private static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(45);

    public bool Touch(Guid userKey, string connectionId)
    {
        lock (_gate)
        {
            Prune();
            var wasOnline = _connections.Values.Any(x => x.UserKey == userKey);
            if (_connections.TryGetValue(connectionId, out var old) && old.UserKey != userKey)
                throw new MessengerException(403, "connectionMismatch");
            _connections[connectionId] = new(userKey, clock.GetUtcNow(), old?.LastTyping ?? DateTimeOffset.MinValue);
            return !wasOnline;
        }
    }
    public bool Remove(Guid userKey, string connectionId)
    {
        lock (_gate)
        {
            Prune();
            if (!_connections.TryGetValue(connectionId, out var connection) || connection.UserKey != userKey) return false;
            _connections.Remove(connectionId);
            return !_connections.Values.Any(x => x.UserKey == userKey);
        }
    }
    public bool IsOnline(Guid userKey)
    {
        lock (_gate)
        {
            Prune();
            return _connections.Values.Any(x => x.UserKey == userKey);
        }
    }
    public bool CanType(string connectionId, bool typing)
    {
        lock (_gate)
        {
            Prune();
            if (!_connections.TryGetValue(connectionId, out var connection)) return false;
            var now = clock.GetUtcNow();
            if (now - connection.LastTyping < TimeSpan.FromMilliseconds(300)) return false;
            _connections[connectionId] = connection with { LastTyping = now, Seen = now };
            return true;
        }
    }
    private void Prune()
    {
        var cutoff = clock.GetUtcNow() - Lifetime;
        foreach (var key in _connections.Where(x => x.Value.Seen <= cutoff).Select(x => x.Key).ToArray()) _connections.Remove(key);
    }
}
