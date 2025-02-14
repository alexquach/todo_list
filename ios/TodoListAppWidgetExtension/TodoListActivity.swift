import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.1, *)
struct TodoListLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TodoListAttributes.self) { context in
            // Lock screen/banner UI
            VStack {
                Text("Tasks remaining: \(context.state.taskCount)")
            }
        } dynamicIsland: { context in
            // Dynamic Island UI
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("Tasks")
                }
                
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.taskCount)")
                }
            } compactLeading: {
                Text("📝")
            } compactTrailing: {
                Text("\(context.state.taskCount)")
            } minimal: {
                Text("\(context.state.taskCount)")
            }
        }
    }
}
