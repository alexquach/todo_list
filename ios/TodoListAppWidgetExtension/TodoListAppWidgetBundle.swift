//
//  TodoListAppWidgetBundle.swift
//  TodoListApp
//
//  Created by Alex Quach on 2/6/25.
//

import WidgetKit
import SwiftUI

struct TodoListAppWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) {
            TodoListLiveActivity()
        }
    }
}
