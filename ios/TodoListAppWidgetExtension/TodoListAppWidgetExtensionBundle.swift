//
//  TodoListAppWidgetExtensionBundle.swift
//  TodoListAppWidgetExtension
//
//  Created by Alex Quach on 2/6/25.
//

import WidgetKit
import SwiftUI

@main
struct TodoListAppWidgetExtensionBundle: WidgetBundle {
    var body: some Widget {
        TodoListAppWidgetExtension()
        TodoListAppWidgetExtensionControl()
        TodoListAppWidgetExtensionLiveActivity()
    }
}
