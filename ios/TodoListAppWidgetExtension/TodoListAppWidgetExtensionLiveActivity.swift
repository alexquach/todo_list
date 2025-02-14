//
//  TodoListAppWidgetExtensionLiveActivity.swift
//  TodoListAppWidgetExtension
//
//  Created by Alex Quach on 2/6/25.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct TodoListAppWidgetExtensionAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct TodoListAppWidgetExtensionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TodoListAppWidgetExtensionAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension TodoListAppWidgetExtensionAttributes {
    fileprivate static var preview: TodoListAppWidgetExtensionAttributes {
        TodoListAppWidgetExtensionAttributes(name: "World")
    }
}

extension TodoListAppWidgetExtensionAttributes.ContentState {
    fileprivate static var smiley: TodoListAppWidgetExtensionAttributes.ContentState {
        TodoListAppWidgetExtensionAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: TodoListAppWidgetExtensionAttributes.ContentState {
         TodoListAppWidgetExtensionAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: TodoListAppWidgetExtensionAttributes.preview) {
   TodoListAppWidgetExtensionLiveActivity()
} contentStates: {
    TodoListAppWidgetExtensionAttributes.ContentState.smiley
    TodoListAppWidgetExtensionAttributes.ContentState.starEyes
}
