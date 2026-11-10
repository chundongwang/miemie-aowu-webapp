import Capacitor

class SingingBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SingingAudioPlugin())
    }
}
