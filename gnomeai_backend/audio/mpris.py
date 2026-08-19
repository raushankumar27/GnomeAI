import threading
import sys
import os

class MPRISManager:
    """Manages D-Bus MPRIS MediaPlayer2 interface for Linux desktop media control integrations."""

    def __init__(self):
        self.dbus_thread = None
        self.loop = None
        self.playback_status = "Stopped"
        self.current_metadata = {}

    def start(self):
        self.dbus_thread = threading.Thread(target=self._run_dbus_loop, daemon=True)
        self.dbus_thread.start()

    def _run_dbus_loop(self):
        try:
            import dbus
            import dbus.service
            from dbus.mainloop.glib import DBusGMainLoop
            from gi.repository import GLib

            DBusGMainLoop(set_as_default=True)
            bus = dbus.SessionBus()

            class GnomeAIMediaPlayer(dbus.service.Object):
                def __init__(self, manager, bus_name, object_path="/org/mpris/MediaPlayer2"):
                    super().__init__(bus_name, object_path)
                    self.manager = manager

                @dbus.service.method("org.mpris.MediaPlayer2", in_signature="", out_signature="")
                def Raise(self):
                    pass

                @dbus.service.method("org.mpris.MediaPlayer2", in_signature="", out_signature="")
                def Quit(self):
                    pass

                @dbus.service.method("org.mpris.MediaPlayer2.Player", in_signature="", out_signature="")
                def Play(self):
                    pass

                @dbus.service.method("org.mpris.MediaPlayer2.Player", in_signature="", out_signature="")
                def Pause(self):
                    self.Stop()

                @dbus.service.method("org.mpris.MediaPlayer2.Player", in_signature="", out_signature="")
                def PlayPause(self):
                    self.Stop()

                @dbus.service.method("org.mpris.MediaPlayer2.Player", in_signature="", out_signature="")
                def Stop(self):
                    try:
                        import subprocess
                        subprocess.run(["killall", "aplay"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        subprocess.run(["killall", "spd-say"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    except:
                        pass
                    self.manager.update_status("Stopped")

                @dbus.service.method("org.freedesktop.DBus.Properties", in_signature="ss", out_signature="v")
                def Get(self, interface_name, property_name):
                    return self.GetAll(interface_name).get(property_name, dbus.String(""))

                @dbus.service.method("org.freedesktop.DBus.Properties", in_signature="s", out_signature="a{sv}")
                def GetAll(self, interface_name):
                    if interface_name == "org.mpris.MediaPlayer2":
                        return {
                            "CanQuit": dbus.Boolean(False),
                            "CanRaise": dbus.Boolean(False),
                            "HasTrackList": dbus.Boolean(False),
                            "Identity": dbus.String("GnomeAI Studio"),
                            "SupportedUriSchemes": dbus.Array([], signature="s"),
                            "SupportedMimeTypes": dbus.Array([], signature="s")
                        }
                    elif interface_name == "org.mpris.MediaPlayer2.Player":
                        m = {}
                        if self.manager.current_metadata:
                            m = {
                                "mpris:trackid": dbus.ObjectPath("/org/gnomeai/track/0"),
                                "xesam:title": dbus.String(self.manager.current_metadata.get("title", "Speech")),
                                "xesam:artist": dbus.Array([dbus.String("GnomeAI")], signature="s"),
                                "mpris:length": dbus.Int64(0)
                            }
                        return {
                            "PlaybackStatus": dbus.String(self.manager.playback_status),
                            "Rate": dbus.Double(1.0),
                            "Metadata": dbus.Dictionary(m, signature="sv"),
                            "Volume": dbus.Double(1.0),
                            "Position": dbus.Int64(0),
                            "MinimumRate": dbus.Double(1.0),
                            "MaximumRate": dbus.Double(1.0),
                            "CanGoNext": dbus.Boolean(False),
                            "CanGoPrevious": dbus.Boolean(False),
                            "CanPlay": dbus.Boolean(False),
                            "CanPause": dbus.Boolean(True),
                            "CanSeek": dbus.Boolean(False),
                            "CanControl": dbus.Boolean(True)
                        }
                    return {}

            name = dbus.service.BusName("org.mpris.MediaPlayer2.GnomeAI", bus)
            self.mpris_object = GnomeAIMediaPlayer(self, name)
            
            self.loop = GLib.MainLoop()
            self.loop.run()
        except Exception as e:
            print(f"[MPRIS] Failed to start MPRIS interface: {str(e)}", flush=True)

    def update_status(self, status, text=""):
        self.playback_status = status
        if text:
            self.current_metadata = {"title": text}
        else:
            self.current_metadata = {}

mpris_manager = MPRISManager()
