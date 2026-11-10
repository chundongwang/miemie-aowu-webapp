import AVFoundation
import Capacitor

/// Configures and reports routing only. PCM and its clock remain in Web Audio.
@objc(SingingAudioPlugin)
public class SingingAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SingingAudioPlugin"
    public let jsName = "SingingAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "release", returnType: CAPPluginReturnPromise)
    ]
    private var observers: [NSObjectProtocol] = []
    private var previous: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?

    public override func load() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self, self.previous != nil else { return }
            self.notifyListeners("routeChanged", data: self.route())
        })
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] notification in
            guard let self = self, self.previous != nil,
                  let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  type == AVAudioSession.InterruptionType.began.rawValue else { return }
            self.notifyListeners("interrupted", data: [:])
        })
    }

    deinit { observers.forEach { NotificationCenter.default.removeObserver($0) } }

    @objc func configure(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()
            if self.previous == nil { self.previous = (session.category, session.mode, session.categoryOptions) }
            do {
                // Keep music on A2DP; don't opt into HFP, which couples headset input/output.
                try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothA2DP, .defaultToSpeaker])
                try session.setActive(true)
                if let builtIn = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
                    try session.setPreferredInput(builtIn)
                }
                call.resolve(self.route())
            } catch {
                // The web fallback can still work. Restore our previous configuration first.
                self.restore()
                call.reject("Could not configure audio route", nil, error)
            }
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.route()) }
    }

    @objc func release(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.restore()
            call.resolve()
        }
    }

    private func restore() {
        guard let saved = previous else { return }
        previous = nil
        let session = AVAudioSession.sharedInstance()
        try? session.setPreferredInput(nil)
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        try? session.setCategory(saved.0, mode: saved.1, options: saved.2)
    }

    private func route() -> JSObject {
        let session = AVAudioSession.sharedInstance()
        let current = session.currentRoute
        return [
            "inputs": current.inputs.map { ["name": $0.portName, "type": $0.portType.rawValue] },
            "outputs": current.outputs.map { ["name": $0.portName, "type": $0.portType.rawValue] },
            "inputLatencyMs": session.inputLatency * 1000,
            "outputLatencyMs": session.outputLatency * 1000,
            "bufferMs": session.ioBufferDuration * 1000,
            "sampleRate": session.sampleRate,
            "builtInMic": current.inputs.contains { $0.portType == .builtInMic },
            "bluetoothOutput": current.outputs.contains { [.bluetoothA2DP, .bluetoothHFP, .bluetoothLE].contains($0.portType) }
        ]
    }
}
