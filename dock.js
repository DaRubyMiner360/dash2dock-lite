'use strict';

const { St, Shell, GObject, Gio, GLib, Gtk, Meta, Clutter } = imports.gi;

const Main = imports.ui.main;
const Dash = imports.ui.dash.Dash;
const Fav = imports.ui.appFavorites;
const Point = imports.gi.Graphene.Point;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Animator = Me.imports.animator.Animator;
const AutoHide = Me.imports.autohide.AutoHide;
const Bounce = Me.imports.effects.easing.Bounce;
const Linear = Me.imports.effects.easing.Linear;

const EDGE_DISTANCE = 20;

let _preferredIconSizes = null;

var Dock = GObject.registerClass(
  {},
  class Dock extends St.BoxLayout {
    _init() {
      super._init({
        name: 'd2dldotsContainer',
        vertical: true,
        reactive: true,
        track_hover: true,
      });

      let pivot = new Point();
      pivot.x = 0.5;
      pivot.y = 0.5;
      this.pivot_point = pivot;

      this.animator = new Animator();
      this.animator.dashContainer = this;
      this.autohider = new AutoHide();
      this.autohider.dashContainer = this;
      this.autohider.animator = this.animator;

      this._padding = new St.Widget();
      this.add_child(this._padding);

      this.dash = new Dash();
      this.dash.set_name('dash');
      this.dash.add_style_class_name('overview');
      this.dash._adjustIconSize = () => {};
      this.dash.visible = false;
      this.add_child(this.dash);

      this.listeners = [this.animator, this.autohider];
      this.connectObject(
        'button-press-event',
        this._onButtonEvent.bind(this),
        'motion-event',
        this._onMotionEvent.bind(this),
        'enter-event',
        this._onEnterEvent.bind(this),
        'leave-event',
        this._onLeaveEvent.bind(this),
        'destroy',
        () => {},
        this
      );
    }

    vfunc_scroll_event(scrollEvent) {
      this._onScrollEvent({}, scrollEvent);
      return Clutter.EVENT_PROPAGATE;
    }

    dock() {}

    undock() {}

    addToChrome() {
      if (this._onChrome) {
        return;
      }

      Main.layoutManager.addChrome(this, {
        affectsStruts: !this.extension.autohide_dash,
        // affectsStruts: true,
        affectsInputRegion: true,
        trackFullscreen: true,
      });

      if (this.animator._iconsContainer) {
        Main.uiGroup.remove_child(this.animator._dotsContainer);
        Main.uiGroup.remove_child(this.animator._iconsContainer);
        Main.uiGroup.remove_child(this.animator._background);
        Main.uiGroup.insert_child_above(this.animator._dotsContainer, this);
        Main.uiGroup.insert_child_below(
          this.animator._iconsContainer,
          this.animator._dotsContainer
        );
        Main.uiGroup.insert_child_below(
          this.animator._background,
          this.animator.dashContainer
        );
      }

      this._onChrome = true;
    }

    removeFromChrome() {
      if (!this._onChrome) {
        return;
      }

      Main.layoutManager.removeChrome(this);
      this._onChrome = false;
    }

    _onScrollEvent(obj, evt) {
      this.listeners
        .filter((l) => {
          return l._enabled;
        })
        .forEach((l) => {
          if (l._onScrollEvent) l._onScrollEvent(obj, evt);
        });
    }

    _onButtonEvent(obj, evt) {
      this.listeners
        .filter((l) => {
          return l._enabled;
        })
        .forEach((l) => {
          if (l._onButtonEvent) l._onButtonEvent(obj, evt);
        });
    }

    _onMotionEvent() {
      this.listeners
        .filter((l) => {
          return l._enabled;
        })
        .forEach((l) => {
          if (l._onMotionEvent) l._onMotionEvent();
        });
    }

    _onEnterEvent() {
      this.listeners
        .filter((l) => {
          return l._enabled;
        })
        .forEach((l) => {
          if (l._onEnterEvent) l._onEnterEvent();
        });

      this.layout();
    }

    _onLeaveEvent() {
      this.listeners
        .filter((l) => {
          return l._enabled;
        })
        .forEach((l) => {
          if (l._onLeaveEvent) l._onLeaveEvent();
        });
    }

    animate() {
      this._onEnterEvent();
    }

    cancelAnimations() {
      this.extension._hiTimer.cancel(this.animator._animationSeq);
      this.animator._animationSeq = null;
      this.extension._hiTimer.cancel(this.autohider._animationSeq);
      this.autohider._animationSeq = null;
    }

    _maybeMinimizeOrMaximize(app) {
      let windows = app.get_windows();
      if (!windows.length) return;

      let event = Clutter.get_current_event();
      let modifiers = event ? event.get_state() : 0;
      let pressed = event.type() == Clutter.EventType.BUTTON_PRESS;
      let button1 = (modifiers & Clutter.ModifierType.BUTTON1_MASK) != 0;
      let button2 = (modifiers & Clutter.ModifierType.BUTTON2_MASK) != 0;
      let button3 = (modifiers & Clutter.ModifierType.BUTTON3_MASK) != 0;
      let shift = (modifiers & Clutter.ModifierType.SHIFT_MASK) != 0;
      let isMiddleButton = button3; // middle?
      let isCtrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) != 0;
      let openNewWindow =
        app.can_open_new_window() &&
        app.state == Shell.AppState.RUNNING &&
        (isCtrlPressed || isMiddleButton);
      if (openNewWindow) return;

      let workspaceManager = global.workspace_manager;
      let activeWs = workspaceManager.get_active_workspace();
      let focusedWindow = null;

      windows.forEach((w) => {
        if (w.has_focus()) {
          focusedWindow = w;
        }
      });

      // delay - allow dash to actually call 'activate' first
      if (focusedWindow) {
        this.extension._hiTimer.runOnce(() => {
          if (shift) {
            if (focusedWindow.get_maximized() == 3) {
              focusedWindow.unmaximize(3);
            } else {
              focusedWindow.maximize(3);
            }
          } else {
            windows.forEach((w) => {
              w.minimize();
            });
          }
        }, 50);
      } else {
        this.extension._hiTimer.runOnce(() => {
          windows.forEach((w) => {
            if (w.is_hidden()) {
              w.unminimize();
              if (w.has_focus()) {
                w.raise();
              }
            }
          });
        }, 50);
      }
    }

    _findIcons() {
      if (!this.dash) return [];

      if (this.dash._showAppsIcon) {
        this.dash._showAppsIcon.visible = this.extension.apps_icon;
      }

      this._separators = [];

      // hook on showApps
      if (this.dash.showAppsButton && !this.dash.showAppsButton._checkEventId) {
        this.dash.showAppsButton._checkEventId =
          this.dash.showAppsButton.connect('notify::checked', () => {
            if (!Main.overview.visible) {
              Main.uiGroup
                .find_child_by_name('overview')
                ._controls._toggleAppsPage();
            }
          });
      }

      // W: breakable
      let icons = this.dash._box.get_children().filter((actor) => {
        if (!actor.child) {
          let cls = actor.get_style_class_name();
          if (cls === 'dash-separator') {
            actor.width = (this.iconSize / 8) * (this.scaleFactor || 1);
            actor.height = (this.iconSize / 8) * (this.scaleFactor || 1);
            this._separators.push(actor);
          }
          return false;
        }

        actor._cls = actor.get_style_class_name();

        if (actor.child._delegate && actor.child._delegate.icon) {
          // hook activate function
          if (actor.child.activate && !actor.child._activate) {
            actor.child._activate = actor.child.activate;
            actor.child.activate = () => {
              this._maybeBounce(actor);
              this._maybeMinimizeOrMaximize(actor.child.app);
              actor.child._activate();
            };
          }

          return true;
        }
        return false;
      });

      // hide running apps
      if (this.extension.favorites_only) {
        let favorites = Fav.getAppFavorites();
        let favorite_ids = favorites._getIds();
        icons = icons.filter((i) => {
          let app = i.child.app;
          let appId = app ? app.get_id() : '';
          let shouldInclude = favorite_ids.includes(appId);
          i.child.visible = shouldInclude;
          if (!shouldInclude) {
            i.width = -1;
            i.height = -1;
          }
          return shouldInclude;
        });
      }

      icons.forEach((c) => {
        // W: breakable
        let label = c.label;
        let appwell = c.first_child;
        let draggable = appwell._draggable;
        let widget = appwell.first_child;
        let icongrid = widget.first_child;
        let boxlayout = icongrid.first_child;
        let bin = boxlayout.first_child;
        let icon = bin.first_child;

        c._bin = bin;
        c._label = label;
        c._draggable = draggable;
        c._appwell = appwell;
        if (icon) {
          c._icon = icon;
        }
      });

      try {
        // W: breakable
        let appsIcon = this.dash._showAppsIcon;
        let apps = this.dash._showAppsIcon;
        if (apps) {
          let widget = appsIcon.child;
          if (widget && widget.width > 0 && widget.get_parent().visible) {
            let icongrid = widget.first_child;
            let boxlayout = icongrid.first_child;
            let bin = boxlayout.first_child;
            let icon = bin.first_child;
            let c = apps;
            // c.child = widget;
            c._bin = bin;
            c._icon = icon;
            c._label = widget._delegate.label;
            icons.push(c);
          }
        }
      } catch (err) {
        // could happen if ShowApps is hidden or not yet created?
      }

      this._icons = icons;
      icons.forEach((icon) => {
        if (!icon._destroyConnectId) {
          icon._destroyConnectId = icon.connect('destroy', () => {
            this.animator._previousFind = null;
          });
        }
      });
      return icons;
    }

    layout(disable) {
      if (disable) return;

      let {
        dock_location,
        experimental_features,
        icon_size,
        edge_distance,
        panel_mode,
        shrink_icons,
        animation_spread,
        animation_magnify,
      } = this.extension;

      this.extension._queryDisplay();

      let pos = dock_location || 0;
      // dock position -- [left, right] are experimental
      if (!experimental_features) {
        pos = 0;
      }

      // See St.Direction position constants
      // remap [ bottom, left, right, top ] >> [ top, right, bottom, left ]
      this.extension._position = [2, 3, 1, 0][pos];
      this.extension._vertical =
        this.extension._position == 1 || this.extension._position == 3;
      this._position = this.extension._position;

      let scaleFactor = this._monitor.geometry_scale;

      let iconSize = 64;
      if (!_preferredIconSizes) {
        _preferredIconSizes = [32];
        for (let i = 16; i < 128; i += 4) {
          _preferredIconSizes.push(i);
        }
      }
      iconSize =
        2 *
        (_preferredIconSizes[
          Math.floor(icon_size * _preferredIconSizes.length)
        ] || 64);
      iconSize *= this.extension.scale;
      this.iconSize = iconSize;

      this._edge_distance = (edge_distance || 0) * EDGE_DISTANCE * scaleFactor;

      let distance = panel_mode ? 0 : this._edge_distance;
      let dockPadding = iconSize * 0.1;
      if (panel_mode) {
        distance -= 8;
      }

      // scale down icons to fit monitor
      if (this._icons) {
        let iconSpacing = iconSize * (1.2 + animation_spread / 4);
        let limit = this.extension._vertical ? 0.96 : 0.98;
        let scaleDown = 1.0;
        let maxWidth =
          (this.extension._vertical
            ? this._monitor.height
            : this._monitor.width) * limit;
        let projectedWidth = iconSpacing * scaleFactor * this._icons.length;
        let iconSizeScaledUp =
          iconSize + iconSize * animation_magnify * scaleFactor;
        projectedWidth += iconSizeScaledUp * 4 - iconSize * scaleFactor * 4;
        if (projectedWidth > maxWidth * 0.98) {
          scaleDown =
            (maxWidth - (iconSize / 2) * scaleFactor) / projectedWidth;
        }
        iconSize *= scaleDown;
        dockPadding *= scaleDown;
        distance *= scaleDown;
      }
      this.extension._effective_edge_distance = distance;

      let scale = 0.5 + this.extension.scale / 2;
      let dashHeight = iconSize * (shrink_icons ? 1.8 : 1.6) * scale;
      let dockHeight =
        (iconSize + dockPadding) * (shrink_icons ? 1.8 : 1.6) * scale;
      dockHeight += this.extension._effective_edge_distance;
      this.iconSize = iconSize;

      this.dash.visible = true;
      this.vertical = !this.extension._vertical;

      // check should disable hide
      this._disableAutohide = false;
      {
        let display = global.display;
        switch (this._position) {
          // left
          case 3:
            this._disableAutohide =
              display.get_monitor_neighbor_index(
                this._monitorIndex,
                Meta.DisplayDirection.LEFT
              ) != -1;
            break;
          // right
          case 1:
            this._disableAutohide =
              display.get_monitor_neighbor_index(
                this._monitorIndex,
                Meta.DisplayDirection.RIGHT
              ) != -1;
            break;
          // bottom
          case 0:
          default:
            this._disableAutohide =
              display.get_monitor_neighbor_index(
                this._monitorIndex,
                Meta.DisplayDirection.DOWN
              ) != -1;
            break;
        }
      }

      if (this.extension._vertical) {
        let sh = this._monitor.height;
        // left/right
        this.set_size(
          dockHeight * scaleFactor,
          sh - (this._monitorIsPrimary ? Main.panel.height : 0)
        );
        this.dash.last_child.layout_manager.orientation = 1;
        this.dash._box.layout_manager.orientation = 1;
        this.dash.height = -1;
        this.dash.width = dockHeight * scaleFactor;
        this.dash.add_style_class_name('vertical');
      } else {
        let sw = this._monitor.width;
        // top/bottom
        this.set_size(sw, dockHeight * scaleFactor);
        this.dash.last_child.layout_manager.orientation = 0;
        this.dash._box.layout_manager.orientation = 0;
        this.dash.height = dockHeight * scaleFactor;
        this.dash.width = -1;
        this.dash.remove_style_class_name('vertical');
      }

      if (this.autohider._enabled && !this.autohider._shown) {
        // remain hidden
      } else {
        if (this.extension._vertical) {
          // left
          this.set_position(
            this._monitor.x,
            this._monitor.y + (this._monitorIsPrimary ? Main.panel.height : 0)
          );

          // right
          if (this._position == 1) {
            this.x += this._monitor.width;
            this.x -= dockHeight * scaleFactor;
          }
        } else {
          // top/bottom
          this.set_position(
            this._monitor.x,
            this._monitor.y + this._monitor.height - dockHeight * scaleFactor
          );
        }

        this._fixedPosition = [this.x, this.y];

        this._hidePosition = [...this._fixedPosition];

        let hidePad = 4 * scaleFactor;
        if (this.extension._vertical) {
          this._hidePosition[0] =
            this._monitor.x - dockHeight * scaleFactor + hidePad;

          // right
          if (this._position == 1) {
            this._hidePosition[0] =
              this._monitor.x + this._monitor.width - hidePad;
          }
        } else {
          this._hidePosition[1] =
            this._monitor.y + this._monitor.height - hidePad;
        }

        this._dockHeight = dockHeight * scaleFactor;
        this._dockPadding = dockPadding * scaleFactor;
        this._dashHeight = dashHeight * scaleFactor;
      }
    }

    _maybeBounce(container) {
      if (!this.extension.open_app_animation) {
        return;
      }
      if (container.child.app && !container.child.app.get_n_windows()) {
        if (container._renderedIcon) {
          Main._renderedIcon = container._renderedIcon;
          this._bounceIcon(container._renderedIcon);
        }
      }
    }

    _bounceIcon(icon) {
      if (!icon) {
        icon = this.animator._iconsContainer.get_children()[0];
      }

      let scaleFactor = this._monitor.geometry_scale;
      let travel =
        (this.iconSize / 3) *
        (this.extension.animation_rise * 1.5) *
        scaleFactor;
      icon._img.translation_y = 0;

      let t = 250;
      let _frames = [
        {
          _duration: t,
          _func: (f, s) => {
            let res = Linear.easeNone(f._time, 0, travel, f._duration);
            icon._img.translation_y = -res;
          },
        },
        {
          _duration: t * 3,
          _func: (f, s) => {
            let res = Bounce.easeOut(f._time, travel, -travel, f._duration);
            icon._img.translation_y = -res;
          },
        },
      ];

      let frames = [];
      for (let i = 0; i < 3; i++) {
        _frames.forEach((b) => {
          frames.push({
            ...b,
          });
        });
      }

      this.extension._hiTimer.runAnimation([
        ...frames,
        {
          _duration: 10,
          _func: (f, s) => {
            icon._img.translation_y = 0;
          },
        },
      ]);
    }
  }
);
